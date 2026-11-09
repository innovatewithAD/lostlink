# LostLink – College Lost & Found

LostLink is a small website for a college campus. Students can create an account, report an item they lost or found, browse reports from other students, and manage their own reports.



## Features

- Student registration and login
- Dashboard showing lost and found reports
- Add a lost or found item
- Search reports by item name, category, location or description
- View reports added by the logged-in student
- Edit or delete your own reports
- Mark an item as recovered
- Logout
- Contact/inquiry form saved in MongoDB
- Browser-side and server-side form validation

## Technologies

- **HTML** – page structure and forms
- **CSS** – styling and responsive layout
- **JavaScript** – DOM events, search, validation and confirmation messages
- **Node.js** – built-in `http`, `fs`, `path` and `crypto` modules
- **MongoDB Community Server** – local database
- **MongoDB Node.js driver** – connects Node.js to MongoDB


## Files and folders

```text
LostLink/
│
├── .gitignore           # Keeps node_modules and local secrets out of GitHub
├── Inquiry.js          # MongoDB functions for contact messages
├── PortfolioItem.js    # MongoDB functions for lost/found reports
├── User.js             # MongoDB functions for student accounts
├── auth.html           # Login and registration page template
├── auth.js             # Login/register form validation
├── index.html          # Home page
├── manager.html        # Dashboard template used by the server
├── manager.js          # Dashboard form validation and delete confirmation
├── package.json        # Project details and npm commands
├── portfolio.js        # Search/filter for report cards
├── README.md           # Project documentation
├── script.js           # Home page form validation
├── server.js           # Node.js HTTP server and application routes
└── style.css           # Shared page styling
```

## Requirements

Install these on your computer:

1. Node.js (LTS version): https://nodejs.org/
2. MongoDB Community Server: https://www.mongodb.com/try/download/community
3. MongoDB Compass (optional, for viewing the data): https://www.mongodb.com/products/tools/compass

The application connects to the local MongoDB server at:

```text
mongodb://127.0.0.1:27017
```

## Run on Windows / VS Code

1. Install MongoDB Community Server. During installation, choose the option to install MongoDB as a Windows service.
2. Make sure the MongoDB service is running. You can check in `services.msc` for **MongoDB Server**.
3. Extract the `LostLink` folder from the ZIP.
4. Open that folder in Visual Studio Code.
5. Open **Terminal → New Terminal**.
6. Install the MongoDB driver:

```bash
npm install
```

7. Start the application:

```bash
npm start
```

8. Open this address in your browser:

```text
http://localhost:3000
```

Create an account, log in, and try adding a report.

To stop the server, click the terminal and press `Ctrl + C`.

## MongoDB database

The application uses the database `lostLinkDB`. It creates these collections when the relevant data is first saved:

### `users`

Stores:

- `name`
- `email`
- `salt`
- `passwordHash`
- `createdAt`

### `items`

Stores:

- `itemName`
- `type` (`Lost` or `Found`)
- `category`
- `location`
- `description`
- `userId`
- `ownerName`
- `status` (`Active` or `Recovered`)
- `createdAt`
- `updatedAt` (after editing or changing status)

### `inquiries`

Stores contact messages:

- `name`
- `email`
- `message`
- `createdAt`

Open MongoDB Compass and connect using `mongodb://127.0.0.1:27017` to inspect the database.

## How CRUD is used

| Operation | Application feature | MongoDB method |
|---|---|---|
| Create | Register, add report, send inquiry | `insertOne()` |
| Read | Login lookup and display reports | `findOne()`, `find()` |
| Update | Edit report and mark recovered | `updateOne()` |
| Delete | Delete your report | `deleteOne()` |

The MongoDB operations are placed in `User.js`, `PortfolioItem.js` and `Inquiry.js`. `server.js` imports and uses these functions.

## Main routes

| Route | Purpose |
|---|---|
| `/` | Home page and inquiry form |
| `/auth` | Login and registration |
| `/dashboard` | Browse all lost and found reports |
| `/my-reports` | View your own reports |
| `/add` | Add a report |
| `/edit/:id` | Edit your own report |

## Useful npm command

Check JavaScript syntax with:

```bash
npm run check
```

