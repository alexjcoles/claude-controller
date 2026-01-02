# PR Review Dashboard

A web and CLI dashboard for viewing GitHub Pull Request comments organized by reviewer. Perfect for PRs with multiple automated code reviewers where comments can be hard to parse.

## Features

- **Organized by Reviewer**: Comments are grouped by each reviewer, making it easy to see feedback from each source
- **Bot Detection**: Automatically identifies and labels bot reviewers
- **Review State Tracking**: Shows approval status, change requests, and comment counts
- **Inline Comment Support**: Displays code comments with file paths and line numbers
- **Flexible Filtering**: Filter by specific reviewers, hide bots, or hide author comments
- **Web Interface**: Beautiful dark-themed web dashboard
- **CLI Support**: Command-line interface for terminal users

## Installation

```bash
npm install
npm run build
```

## Web Dashboard

Start the web server:

```bash
npm run server
```

Then open http://localhost:3000 in your browser.

You can also pass a PR directly via URL:
```
http://localhost:3000?pr=owner/repo#123
```

### Web Interface Features

- Enter any GitHub PR URL or short format (owner/repo#123)
- Filter comments by reviewer
- Toggle bot and author visibility
- Collapsible reviewer cards
- Dark theme optimized for readability

## CLI Usage

### View PR Comments

```bash
# Using GitHub URL
npm start -- view https://github.com/owner/repo/pull/123

# Using short format
npm start -- view owner/repo#123

# Using slash format
npm start -- view owner/repo/123
```

### Options

```bash
# Hide bot reviewers
npm start -- view owner/repo#123 --no-bots

# Hide PR author's comments
npm start -- view owner/repo#123 --no-author

# Show only a specific reviewer
npm start -- view owner/repo#123 -r "reviewer-name"

# Show only reviewer list (summary view)
npm start -- view owner/repo#123 -l
```

### List Reviewers

```bash
npm start -- reviewers owner/repo#123
```

## Authentication

Set your GitHub token as an environment variable:

```bash
export GITHUB_TOKEN=your_token_here
```

Or create a `.env` file:

```
GITHUB_TOKEN=your_token_here
```

Or pass it directly:

```bash
npm start -- view owner/repo#123 --token your_token_here
```

### Required Token Scopes

- `public_repo` for public repositories
- `repo` for private repositories

Create a token at: https://github.com/settings/tokens

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- view owner/repo#123

# Build for production
npm run build

# Run production build
npm start -- view owner/repo#123
```

## Example Output

```
────────────────────────────────────────────────────────────────────────────────
  PR #123: Add new feature
────────────────────────────────────────────────────────────────────────────────
  Author: developer
  State:  open
  Created: 1/2/2024, 10:30:00 AM
  Updated: 1/2/2024, 2:45:00 PM
  URL: https://github.com/owner/repo/pull/123
────────────────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────────────────
  👤 code-reviewer-bot [BOT]
────────────────────────────────────────────────────────────────────────────────
  Reviews: 1 | Approved: 0 | Changes Requested: 1 | Inline Comments: 5 | General Comments: 0

  📋 Reviews:
  ────────────────────────────────────

  🔴 CHANGES_REQUESTED
     Submitted: 1/2/2024, 11:00:00 AM

     Review Summary:
      Please address the following issues before merging.

     Inline Comments (5):
  📁 src/feature.ts:42
      Consider using a more descriptive variable name here.
      1/2/2024, 11:00:01 AM

  ...

────────────────────────────────────────────────────────────────────────────────
  📊 Summary
────────────────────────────────────────────────────────────────────────────────
  Total Reviewers: 3
    - Humans: 1
    - Bots: 2

  ✅ Approvals: 1
  🔴 Changes Requested: 1
  💬 Total Comments: 12
────────────────────────────────────────────────────────────────────────────────
```

## License

MIT
