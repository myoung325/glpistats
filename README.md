# GLPI Ticket Analyzer & Dashboard

A lightweight, zero-dependency, client-side dashboard for visualizing GLPI helpdesk ticket exports. 

This tool allows IT administrators to take standard CSV exports directly from GLPI and instantly generate meaningful charts and metrics to track helpdesk performance, ticket backlogs, and category breakdowns.

🌟 **Live Demo:** Try it out right in your browser via GitHub Pages: [https://myoung325.github.io/glpistats/](https://myoung325.github.io/glpistats/) 
*(Note: Uploading your CSV to this demo is 100% safe. Processing happens completely locally in your browser.)*

## 🔒 Privacy First (Zero-Server Architecture)
Because helpdesk tickets often contain sensitive internal data (usernames, computer names, IP addresses, etc.), **this tool runs entirely in your local web browser.** * No data is uploaded to any server.
* No database is required.
* It can be run completely offline. 

## ✨ Features

* **Custom Date Ranges & Intervals:** Filter your data by specific start and end dates, and view time-series data grouped by Daily, Weekly, Monthly, or Yearly intervals.
* **Export-Ready Visuals:** Graphs are generated with built-in titles and clean, auto-centering legends—perfect for saving and sharing in team meetings or reports.
* **Customizable Canvas Size:** Easily adjust the width and height of the generated graph to fit your specific display or reporting needs.
* **Multiple Analysis Modes:**
  * **Tickets Opened:** A standard bar chart showing the volume of incoming tickets over time.
  * **Active (Open) Tickets:** Tracks the true backlog of open tickets over time, accounting for historical "ghost" tickets.
  * **Active Tickets by Age:** Stacked bar charts breaking down the open backlog by age. Includes views for standard tracking (up to 4+ weeks) and deep-dive tracking (up to 10+ weeks).
  * **Tickets by Category:** A pie chart breakdown of your most common ticket categories.
  * **Tickets by Entity (Dynamic):** A pie chart breakdown of tickets by Entity/Building. *Note: This feature automatically generates clean acronyms from GLPI's standard `Root > Child > Sub-child` entity hierarchy, making it universally applicable for any organization.*

## 🚀 How to Use (Local Run)

If you prefer not to use the GitHub Pages link above, you can run it locally:
1. Clone or download this repository.
2. Open `index.html` in any modern web browser.
3. Export your ticket data from GLPI (see instructions below).
4. Upload the CSV file, select your parameters, and click **Generate Graph**.

## 📊 How to Export Data from GLPI

To ensure the analyzer works correctly, your GLPI export must meet the following criteria:

1. **Format:** CSV (GLPI typically defaults to semicolon `;` separated, which this tool expects).
2. **Required Columns:** Ensure your view in GLPI includes the following columns before exporting:
   * `ID`
   * `Opening Date` (Crucial for time-series data)
   * `Status`
   * `Last Update` (Used to determine when a ticket was closed)
   * `Category` (Required for the Category pie chart)
   * `Entity` (Required for the Entity pie chart)

*Note: The tool maps "Solved" and "Closed" GLPI statuses to determine a ticket's completion date using the `Last update` field.*

## 🛠️ Technical Details

* **HTML5 Canvas:** All charts are drawn natively using the standard HTML5 `<canvas>` API.
* **Vanilla JavaScript:** No external charting libraries (like Chart.js or D3), no React, no NPM installs. Just clean, raw JavaScript.
* **Ghost Ticket Auditing:** The script includes a console-level audit tool. Press `F12` to open your browser's developer console when generating a chart to see a log of any "Ghost Tickets" (tickets that have been sitting open/pending for more than 90 days).

## 🤖 AI Transparency & Credits

Full transparency: The logic, workflow design, and prompt engineering for this project were directed by **Mike Young**, while the actual code implementation (HTML/JS) was generated using Google's **Gemini** large language model.
