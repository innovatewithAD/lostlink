const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

const User = require("./User");
const PortfolioItem = require("./PortfolioItem");
const Inquiry = require("./Inquiry");

const PORT = Number(process.env.PORT) || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "lostLinkDB";
const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
const MAX_BODY_SIZE = 20 * 1024;
const ROOT = __dirname;

const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
const sessions = new Map();
let db;

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function send(res, statusCode, body, contentType = "text/html; charset=utf-8", extraHeaders = {}) {
  res.writeHead(statusCode, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff", ...extraHeaders });
  res.end(body);
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(303, { Location: location, ...extraHeaders });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;

    req.on("data", chunk => {
      if (tooLarge) return;
      body += chunk.toString("utf8");
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_SIZE) {
        tooLarge = true;
        reject(new Error("FORM_TOO_LARGE"));
      }
    });
    req.on("end", () => {
      if (!tooLarge) resolve(new URLSearchParams(body));
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const result = {};
  const cookieHeader = req.headers.cookie || "";
  cookieHeader.split(";").forEach(part => {
    const separator = part.indexOf("=");
    if (separator > -1) {
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      result[key] = value;
    }
  });
  return result;
}

function getSession(req) {
  const token = parseCookies(req).lostlink_session;
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() - session.lastSeen > SESSION_MAX_AGE) {
    sessions.delete(token);
    return null;
  }

  session.lastSeen = Date.now();
  return { ...session, token };
}

function createSession(user, req) {
  const token = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    csrfToken,
    lastSeen: Date.now()
  });
  const secure = req.socket && req.socket.encrypted ? "; Secure" : "";
  return {
    token,
    cookie: `lostlink_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}${secure}`
  };
}

function clearSessionCookie(req) {
  const secure = req.socket && req.socket.encrypted ? "; Secure" : "";
  return `lostlink_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

function checkRequestOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function checkCsrf(form, session) {
  const submitted = form.get("_csrf") || "";
  const expected = session ? session.csrfToken : "";
  if (!submitted || !expected) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}

function validItemForm(form) {
  const item = {
    itemName: (form.get("itemName") || "").trim(),
    type: (form.get("type") || "").trim(),
    category: (form.get("category") || "").trim(),
    location: (form.get("location") || "").trim(),
    description: (form.get("description") || "").trim()
  };

  if (!item.itemName || item.itemName.length > 80) return { item, error: "Enter an item name (maximum 80 characters)." };
  if (!["Lost", "Found"].includes(item.type)) return { item, error: "Choose whether the item was lost or found." };
  if (!item.category || item.category.length > 50) return { item, error: "Enter a category (maximum 50 characters)." };
  if (!item.location || item.location.length > 100) return { item, error: "Enter a location (maximum 100 characters)." };
  if (!item.description || item.description.length > 500) return { item, error: "Enter a description (maximum 500 characters)." };
  return { item, error: "" };
}

async function readTemplate(fileName) {
  return fs.promises.readFile(path.join(ROOT, fileName), "utf8");
}

function replaceAll(template, replacements) {
  // Replace template markers in one pass so user text inserted into the page
  // cannot accidentally be processed again as another template marker.
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (marker, key) => {
    return Object.prototype.hasOwnProperty.call(replacements, key)
      ? String(replacements[key])
      : marker;
  });
}

async function serveFile(res, fileName, contentType) {
  try {
    const contents = await fs.promises.readFile(path.join(ROOT, fileName));
    send(res, 200, contents, contentType);
  } catch (error) {
    console.error(`Could not read ${fileName}:`, error.message);
    send(res, 500, "File could not be loaded.", "text/plain; charset=utf-8");
  }
}

function itemCard(item, session) {
  const owner = String(item.userId) === session.id;
  const statusClass = item.status === "Recovered" ? "status-done" : "status-open";
  const dateText = item.createdAt instanceof Date ? item.createdAt.toLocaleDateString("en-IN") : "";
  const actions = owner ? `
    <div class="card-actions">
      <a class="text-link" href="/edit/${item._id}">Edit</a>
      ${item.status !== "Recovered" ? `<form method="POST" action="/items/recover/${item._id}"><input type="hidden" name="_csrf" value="${session.csrfToken}"><button class="small-button" type="submit">Mark recovered</button></form>` : ""}
      <form method="POST" action="/items/delete/${item._id}" data-confirm="Delete this report?"><input type="hidden" name="_csrf" value="${session.csrfToken}"><button class="small-button danger-button" type="submit">Delete</button></form>
    </div>` : "";

  return `<article class="item-card">
    <div class="item-top"><span class="tag">${escapeHTML(item.type)}</span><span class="status ${statusClass}">${escapeHTML(item.status || "Active")}</span></div>
    <h2>${escapeHTML(item.itemName)}</h2>
    <p class="muted">${escapeHTML(item.category)} · ${escapeHTML(item.location)}</p>
    <p>${escapeHTML(item.description)}</p>
    <p class="small">Reported by ${escapeHTML(item.ownerName || "Student")}${dateText ? ` · ${escapeHTML(dateText)}` : ""}</p>
    ${actions}
  </article>`;
}

function itemFormMarkup(session, item = null, error = "") {
  const editing = Boolean(item && item._id);
  const action = editing ? `/items/edit/${item._id}` : "/items/create";
  const data = item || {};
  return `<section class="form-card item-form-card" id="itemForm">
    <h2>${editing ? "Edit your report" : "Report an item"}</h2>
    ${error ? `<p class="error" role="alert">${escapeHTML(error)}</p>` : ""}
    <form method="POST" action="${action}" class="stack-form" data-validate>
      <input type="hidden" name="_csrf" value="${session.csrfToken}">
      <label>Item name<input name="itemName" maxlength="80" required value="${escapeHTML(data.itemName || "")}"></label>
      <div class="form-row">
        <label>Report type<select name="type" required>
          <option value="">Choose one</option>
          <option value="Lost" ${data.type === "Lost" ? "selected" : ""}>I lost this item</option>
          <option value="Found" ${data.type === "Found" ? "selected" : ""}>I found this item</option>
        </select></label>
        <label>Category<input name="category" maxlength="50" required value="${escapeHTML(data.category || "")}" placeholder="ID card, books, etc."></label>
      </div>
      <label>Location<input name="location" maxlength="100" required value="${escapeHTML(data.location || "")}" placeholder="Where was it lost or found?"></label>
      <label>Description<textarea name="description" rows="3" maxlength="500" required>${escapeHTML(data.description || "")}</textarea></label>
      <div class="form-actions"><button class="button" type="submit">${editing ? "Save changes" : "Submit report"}</button><a href="${editing ? "/my-reports" : "/dashboard"}">Cancel</a></div>
    </form>
  </section>`;
}

async function renderManagerPage(session, options = {}) {
  const template = await readTemplate("manager.html");
  const reports = options.reports || [];
  const reportMarkup = reports.length
    ? reports.map(item => itemCard(item, session)).join("\n")
    : `<div class="empty-state"><h2>No reports yet</h2><p>${options.mineOnly ? "You have not added any reports." : "There are no reports to display right now."}</p><a class="button" href="/add">Add a report</a></div>`;

  return replaceAll(template, {
    PAGE_TITLE: escapeHTML(options.pageTitle || "Dashboard"),
    PAGE_HEADING: escapeHTML(options.heading || `Hello, ${session.name}`),
    USER_NAME: escapeHTML(session.name),
    CSRF_TOKEN: session.csrfToken,
    NOTICE: options.notice ? `<p class="notice" role="status">${escapeHTML(options.notice)}</p>` : "",
    ITEM_FORM: options.itemForm || "",
    REPORTS_HEADING: options.reportsHeading || "Recent reports",
    REPORT_COUNT: reports.length,
    REPORTS: reportMarkup
  });
}

async function renderAuthPage(message = "") {
  const template = await readTemplate("auth.html");
  return replaceAll(template, { AUTH_NOTICE: escapeHTML(message) });
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const session = getSession(req);

  if (req.method === "GET" && pathname === "/") {
    let html = await readTemplate("index.html");
    const inquiryNotice = requestUrl.searchParams.get("inquiry") === "sent"
      ? "Your message has been saved. Thank you."
      : requestUrl.searchParams.get("inquiry") === "error"
        ? "Please complete the form with valid details and try again."
        : "";
    html = replaceAll(html, { INQUIRY_NOTICE: escapeHTML(inquiryNotice) });
    return send(res, 200, html);
  }

  if (req.method === "GET" && pathname === "/auth") {
    if (session) return redirect(res, "/dashboard");
    return send(res, 200, await renderAuthPage(requestUrl.searchParams.get("message") || ""));
  }
  if (req.method === "GET" && ["/login", "/register"].includes(pathname)) {
    return redirect(res, pathname === "/login" ? "/auth#login" : "/auth#register");
  }

  if (req.method === "GET" && pathname === "/style.css") return serveFile(res, "style.css", "text/css; charset=utf-8");
  if (req.method === "GET" && pathname === "/script.js") return serveFile(res, "script.js", "text/javascript; charset=utf-8");
  if (req.method === "GET" && pathname === "/auth.js") return serveFile(res, "auth.js", "text/javascript; charset=utf-8");
  if (req.method === "GET" && pathname === "/manager.js") return serveFile(res, "manager.js", "text/javascript; charset=utf-8");
  if (req.method === "GET" && pathname === "/portfolio.js") return serveFile(res, "portfolio.js", "text/javascript; charset=utf-8");

  if (req.method === "POST" && !checkRequestOrigin(req)) {
    return send(res, 403, "Request origin could not be verified.", "text/plain; charset=utf-8");
  }

  if (req.method === "POST" && pathname === "/inquiry") {
    const form = await readBody(req);
    const inquiry = {
      name: (form.get("name") || "").trim(),
      email: (form.get("email") || "").trim().toLowerCase(),
      message: (form.get("message") || "").trim()
    };
    if (!inquiry.name || inquiry.name.length > 60 || !isValidEmail(inquiry.email) || !inquiry.message || inquiry.message.length > 600) {
      return redirect(res, "/?inquiry=error");
    }
    await Inquiry.createInquiry(db, inquiry);
    return redirect(res, "/?inquiry=sent");
  }

  if (req.method === "POST" && pathname === "/register") {
    const form = await readBody(req);
    const name = (form.get("name") || "").trim();
    const email = (form.get("email") || "").trim().toLowerCase();
    const password = form.get("password") || "";
    if (!name || name.length > 60 || !isValidEmail(email) || password.length < 8 || password.length > 128) {
      return send(res, 400, await renderAuthPage("Enter a valid name and email. Password must be 8–128 characters."));
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
    let result;
    try {
      result = await User.createUser(db, { name, email, salt, passwordHash, createdAt: new Date() });
    } catch (error) {
      if (error && error.code === 11000) return send(res, 409, await renderAuthPage("An account with this email already exists."));
      throw error;
    }

    const createdUser = { _id: result.insertedId, name, email };
    const newSession = createSession(createdUser, req);
    return redirect(res, "/dashboard", { "Set-Cookie": newSession.cookie });
  }

  if (req.method === "POST" && pathname === "/login") {
    const form = await readBody(req);
    const email = (form.get("email") || "").trim().toLowerCase();
    const password = form.get("password") || "";
    const foundUser = isValidEmail(email) ? await User.findUserByEmail(db, email) : null;

    if (!foundUser || password.length > 128) {
      return send(res, 401, await renderAuthPage("Email or password is incorrect."));
    }

    const submittedHash = crypto.scryptSync(password, foundUser.salt, 64);
    const storedHash = Buffer.from(foundUser.passwordHash, "hex");
    if (storedHash.length !== submittedHash.length || !crypto.timingSafeEqual(storedHash, submittedHash)) {
      return send(res, 401, await renderAuthPage("Email or password is incorrect."));
    }

    const newSession = createSession(foundUser, req);
    return redirect(res, "/dashboard", { "Set-Cookie": newSession.cookie });
  }

  if (req.method === "POST" && pathname === "/logout") {
    if (!session) return redirect(res, "/");
    const form = await readBody(req);
    if (!checkCsrf(form, session)) return send(res, 403, "The form expired. Please sign in again.", "text/plain; charset=utf-8");
    sessions.delete(session.token);
    return redirect(res, "/", { "Set-Cookie": clearSessionCookie(req) });
  }

  if (!session) return redirect(res, "/auth?message=Please%20login%20to%20continue.");

  const notices = {
    created: "Your report has been added.",
    updated: "Your report has been updated.",
    recovered: "The item has been marked as recovered.",
    deleted: "Your report has been deleted."
  };

  if (req.method === "GET" && pathname === "/dashboard") {
    const reports = await PortfolioItem.findAllItems(db);
    return send(res, 200, await renderManagerPage(session, {
      pageTitle: "Dashboard",
      heading: `Hello, ${session.name}`,
      reportsHeading: "All lost and found reports",
      notice: notices[requestUrl.searchParams.get("notice")] || "",
      reports
    }));
  }

  if (req.method === "GET" && pathname === "/my-reports") {
    const reports = await PortfolioItem.findItemsByUser(db, session.id);
    return send(res, 200, await renderManagerPage(session, {
      pageTitle: "My reports",
      heading: "My reports",
      reportsHeading: "Reports added by you",
      mineOnly: true,
      notice: notices[requestUrl.searchParams.get("notice")] || "",
      reports
    }));
  }

  if (req.method === "GET" && pathname === "/add") {
    const reports = await PortfolioItem.findItemsByUser(db, session.id);
    return send(res, 200, await renderManagerPage(session, {
      pageTitle: "Report an item",
      heading: "Report an item",
      reportsHeading: "Your existing reports",
      mineOnly: true,
      reports,
      itemForm: itemFormMarkup(session)
    }));
  }

  const editRoute = pathname.match(/^\/edit\/([a-f0-9]{24})$/i);
  if (req.method === "GET" && editRoute) {
    const itemId = new ObjectId(editRoute[1]);
    const item = await PortfolioItem.findItemById(db, itemId);
    if (!item || String(item.userId) !== session.id) return send(res, 404, "Report not found.", "text/plain; charset=utf-8");
    const reports = await PortfolioItem.findItemsByUser(db, session.id);
    return send(res, 200, await renderManagerPage(session, {
      pageTitle: "Edit report",
      heading: "Edit your report",
      reportsHeading: "Your existing reports",
      reports,
      mineOnly: true,
      itemForm: itemFormMarkup(session, item)
    }));
  }

  if (req.method === "POST") {
    const form = await readBody(req);
    if (!checkCsrf(form, session)) return send(res, 403, "The form expired. Refresh the page and try again.", "text/plain; charset=utf-8");

    if (pathname === "/items/create") {
      const validation = validItemForm(form);
      if (validation.error) {
        const reports = await PortfolioItem.findItemsByUser(db, session.id);
        return send(res, 400, await renderManagerPage(session, {
          pageTitle: "Report an item",
          heading: "Report an item",
          reportsHeading: "Your existing reports",
          reports,
          mineOnly: true,
          itemForm: itemFormMarkup(session, validation.item || null, validation.error)
        }));
      }
      await PortfolioItem.createItem(db, {
        ...validation.item,
        userId: session.id,
        ownerName: session.name,
        status: "Active",
        createdAt: new Date()
      });
      return redirect(res, "/my-reports?notice=created");
    }

    const updateRoute = pathname.match(/^\/items\/edit\/([a-f0-9]{24})$/i);
    if (updateRoute) {
      const itemId = new ObjectId(updateRoute[1]);
      const validation = validItemForm(form);
      if (validation.error) {
        const existingItem = await PortfolioItem.findItemById(db, itemId);
        if (!existingItem || String(existingItem.userId) !== session.id) return send(res, 404, "Report not found.", "text/plain; charset=utf-8");
        const reports = await PortfolioItem.findItemsByUser(db, session.id);
        return send(res, 400, await renderManagerPage(session, {
          pageTitle: "Edit report",
          heading: "Edit your report",
          reportsHeading: "Your existing reports",
          reports,
          mineOnly: true,
          itemForm: itemFormMarkup(session, { ...validation.item, _id: itemId }, validation.error)
        }));
      }
      const result = await PortfolioItem.updateItem(db, itemId, session.id, validation.item);
      if (result.matchedCount === 0) return send(res, 404, "Report not found.", "text/plain; charset=utf-8");
      return redirect(res, "/my-reports?notice=updated");
    }

    const recoverRoute = pathname.match(/^\/items\/recover\/([a-f0-9]{24})$/i);
    if (recoverRoute) {
      const result = await PortfolioItem.markItemRecovered(db, new ObjectId(recoverRoute[1]), session.id);
      if (result.matchedCount === 0) return send(res, 404, "Report not found.", "text/plain; charset=utf-8");
      return redirect(res, "/my-reports?notice=recovered");
    }

    const deleteRoute = pathname.match(/^\/items\/delete\/([a-f0-9]{24})$/i);
    if (deleteRoute) {
      const result = await PortfolioItem.deleteItem(db, new ObjectId(deleteRoute[1]), session.id);
      if (result.deletedCount === 0) return send(res, 404, "Report not found.", "text/plain; charset=utf-8");
      return redirect(res, "/my-reports?notice=deleted");
    }
  }

  if (req.method === "GET" && pathname === "/manager.html") return redirect(res, "/dashboard");
  if (req.method === "GET" && pathname === "/index.html") return redirect(res, "/");
  if (req.method === "GET" && pathname === "/auth.html") return redirect(res, "/auth");

  return send(res, 404, "Page not found.", "text/plain; charset=utf-8");
}

async function startServer() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    await User.createUserIndexes(db);
    await PortfolioItem.createItemIndexes(db);

    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch(error => {
        console.error("Request error:", error);
        if (!res.headersSent) {
          const status = error.message === "FORM_TOO_LARGE" ? 413 : 500;
          send(res, status, status === 413 ? "Form is too large." : "Something went wrong. Check the terminal for details.", "text/plain; charset=utf-8");
        } else {
          res.end();
        }
      });
    });

    server.listen(PORT, () => {
      console.log(`LostLink is running at http://localhost:${PORT}`);
      console.log(`MongoDB database: ${DB_NAME}`);
    });

    const shutdown = async () => {
      server.close();
      await client.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Could not connect to MongoDB. Start MongoDB Community Server and try again.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();
