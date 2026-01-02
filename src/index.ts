#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { GitHubClient } from './github';
import { displayDashboard, displayReviewerList } from './display';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('pr-dashboard')
  .description('Dashboard for viewing GitHub PR comments separated by reviewer')
  .version('1.0.0');

program
  .command('view')
  .description('View PR comments organized by reviewer')
  .argument('<pr>', 'PR reference (owner/repo#123 or GitHub URL)')
  .option('-t, --token <token>', 'GitHub token (or set GITHUB_TOKEN env var)')
  .option('--no-bots', 'Hide bot reviewers')
  .option('--no-author', 'Hide PR author comments')
  .option('-r, --reviewer <name>', 'Show only a specific reviewer')
  .option('-l, --list', 'Show only reviewer list without full comments')
  .action(async (pr: string, options) => {
    try {
      const token = options.token || process.env.GITHUB_TOKEN;

      if (!token) {
        console.error(chalk.red('\n❌ Error: GitHub token required.'));
        console.error(chalk.gray('   Set GITHUB_TOKEN environment variable or use --token flag.\n'));
        console.error(chalk.gray('   To create a token, visit:'));
        console.error(chalk.blue('   https://github.com/settings/tokens\n'));
        process.exit(1);
      }

      const client = new GitHubClient(token);

      // Parse PR reference
      let parsed;
      try {
        parsed = client.parsePRReference(pr);
      } catch (error) {
        console.error(chalk.red(`\n❌ ${(error as Error).message}\n`));
        process.exit(1);
      }

      console.log(chalk.gray(`\nFetching PR ${parsed.owner}/${parsed.repo}#${parsed.pullNumber}...`));

      // Fetch PR data
      const prData = await client.fetchPRComments(parsed);

      // Display dashboard
      if (options.list) {
        displayReviewerList(prData);
      } else {
        displayDashboard(prData, {
          showBots: options.bots !== false,
          showAuthor: options.author !== false,
          onlyReviewer: options.reviewer,
        });
      }
    } catch (error) {
      if ((error as any).status === 404) {
        console.error(chalk.red('\n❌ PR not found. Check the owner, repo, and PR number.\n'));
      } else if ((error as any).status === 401) {
        console.error(chalk.red('\n❌ Authentication failed. Check your GitHub token.\n'));
      } else if ((error as any).status === 403) {
        console.error(chalk.red('\n❌ Access forbidden. Your token may lack necessary permissions.\n'));
        console.error(chalk.gray('   Required scopes: repo (for private repos) or public_repo\n'));
      } else {
        console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
      }
      process.exit(1);
    }
  });

program
  .command('reviewers')
  .description('List all reviewers for a PR')
  .argument('<pr>', 'PR reference (owner/repo#123 or GitHub URL)')
  .option('-t, --token <token>', 'GitHub token (or set GITHUB_TOKEN env var)')
  .action(async (pr: string, options) => {
    try {
      const token = options.token || process.env.GITHUB_TOKEN;

      if (!token) {
        console.error(chalk.red('\n❌ Error: GitHub token required.'));
        console.error(chalk.gray('   Set GITHUB_TOKEN environment variable or use --token flag.\n'));
        process.exit(1);
      }

      const client = new GitHubClient(token);
      const parsed = client.parsePRReference(pr);

      console.log(chalk.gray(`\nFetching reviewers for ${parsed.owner}/${parsed.repo}#${parsed.pullNumber}...`));

      const prData = await client.fetchPRComments(parsed);
      displayReviewerList(prData);
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
      process.exit(1);
    }
  });

// Default command shows help
program.action(() => {
  program.help();
});

program.parse();
