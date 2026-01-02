import chalk from 'chalk';
import { PullRequestInfo, Reviewer, Review, ReviewComment, IssueComment } from './types';

const DIVIDER = '─'.repeat(80);
const THIN_DIVIDER = '─'.repeat(40);

/**
 * Get color for review state
 */
function getStateColor(state: Review['state']): chalk.Chalk {
  switch (state) {
    case 'APPROVED':
      return chalk.green;
    case 'CHANGES_REQUESTED':
      return chalk.red;
    case 'COMMENTED':
      return chalk.blue;
    case 'PENDING':
      return chalk.yellow;
    case 'DISMISSED':
      return chalk.gray;
    default:
      return chalk.white;
  }
}

/**
 * Get emoji for review state
 */
function getStateEmoji(state: Review['state']): string {
  switch (state) {
    case 'APPROVED':
      return '✅';
    case 'CHANGES_REQUESTED':
      return '🔴';
    case 'COMMENTED':
      return '💬';
    case 'PENDING':
      return '⏳';
    case 'DISMISSED':
      return '🚫';
    default:
      return '📝';
  }
}

/**
 * Format a date string for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Wrap text to a certain width
 */
function wrapText(text: string, indent: number = 4, maxWidth: number = 76): string {
  const indentStr = ' '.repeat(indent);
  const lines = text.split('\n');
  const wrapped: string[] = [];

  for (const line of lines) {
    if (line.length <= maxWidth - indent) {
      wrapped.push(indentStr + line);
    } else {
      const words = line.split(' ');
      let currentLine = indentStr;

      for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxWidth) {
          currentLine += (currentLine === indentStr ? '' : ' ') + word;
        } else {
          wrapped.push(currentLine);
          currentLine = indentStr + word;
        }
      }

      if (currentLine.trim()) {
        wrapped.push(currentLine);
      }
    }
  }

  return wrapped.join('\n');
}

/**
 * Display PR header info
 */
export function displayPRHeader(pr: PullRequestInfo): void {
  console.log('\n' + chalk.bold.cyan(DIVIDER));
  console.log(chalk.bold.cyan(`  PR #${pr.number}: ${pr.title}`));
  console.log(chalk.cyan(DIVIDER));
  console.log(chalk.gray(`  Author: ${chalk.white(pr.author)}`));
  console.log(chalk.gray(`  State:  ${chalk.white(pr.state)}`));
  console.log(chalk.gray(`  Created: ${formatDate(pr.createdAt)}`));
  console.log(chalk.gray(`  Updated: ${formatDate(pr.updatedAt)}`));
  console.log(chalk.gray(`  URL: ${chalk.blue(pr.htmlUrl)}`));
  console.log(chalk.cyan(DIVIDER) + '\n');
}

/**
 * Display a single review comment (inline code comment)
 */
function displayReviewComment(comment: ReviewComment, isReply: boolean = false): void {
  const prefix = isReply ? '    ↳ ' : '  ';

  if (comment.path) {
    console.log(chalk.gray(`${prefix}📁 ${comment.path}${comment.line ? `:${comment.line}` : ''}`));
  }

  console.log(wrapText(comment.body, isReply ? 8 : 6));
  console.log(chalk.gray(`${prefix}   ${formatDate(comment.createdAt)}`));
  console.log('');
}

/**
 * Display a single review
 */
function displayReview(review: Review): void {
  const stateColor = getStateColor(review.state);
  const emoji = getStateEmoji(review.state);

  console.log(`  ${emoji} ${stateColor.bold(review.state)}`);

  if (review.submittedAt) {
    console.log(chalk.gray(`     Submitted: ${formatDate(review.submittedAt)}`));
  }

  if (review.body && review.body.trim()) {
    console.log(chalk.white('\n     Review Summary:'));
    console.log(wrapText(review.body, 6));
  }

  if (review.comments.length > 0) {
    console.log(chalk.yellow(`\n     Inline Comments (${review.comments.length}):`));

    // Group comments by thread (using in_reply_to_id)
    const rootComments = review.comments.filter(c => !c.inReplyToId);
    const replyMap = new Map<number, ReviewComment[]>();

    for (const comment of review.comments) {
      if (comment.inReplyToId) {
        if (!replyMap.has(comment.inReplyToId)) {
          replyMap.set(comment.inReplyToId, []);
        }
        replyMap.get(comment.inReplyToId)!.push(comment);
      }
    }

    for (const comment of rootComments) {
      displayReviewComment(comment);
      const replies = replyMap.get(comment.id) || [];
      for (const reply of replies) {
        displayReviewComment(reply, true);
      }
    }

    // Show orphaned replies (if any)
    const orphanedReplies = review.comments.filter(
      c => c.inReplyToId && !review.comments.find(p => p.id === c.inReplyToId)
    );
    for (const reply of orphanedReplies) {
      displayReviewComment(reply, true);
    }
  }

  console.log('');
}

/**
 * Display an issue comment
 */
function displayIssueComment(comment: IssueComment): void {
  console.log(wrapText(comment.body, 4));
  console.log(chalk.gray(`    ${formatDate(comment.createdAt)}`));
  console.log('');
}

/**
 * Display all comments from a single reviewer
 */
export function displayReviewer(reviewer: Reviewer, prAuthor: string): void {
  const isBot = reviewer.type === 'Bot';
  const isAuthor = reviewer.login === prAuthor;

  const badges: string[] = [];
  if (isBot) badges.push(chalk.magenta('[BOT]'));
  if (isAuthor) badges.push(chalk.cyan('[AUTHOR]'));

  const badgeStr = badges.length > 0 ? ' ' + badges.join(' ') : '';

  console.log(chalk.bold.yellow(DIVIDER));
  console.log(chalk.bold.yellow(`  👤 ${reviewer.login}${badgeStr}`));
  console.log(chalk.yellow(DIVIDER));

  // Calculate stats
  const approvals = reviewer.reviews.filter(r => r.state === 'APPROVED').length;
  const changesRequested = reviewer.reviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
  const totalInlineComments = reviewer.reviews.reduce((sum, r) => sum + r.comments.length, 0);

  console.log(chalk.gray(`  Reviews: ${reviewer.reviews.length} | `) +
    chalk.green(`Approved: ${approvals} | `) +
    chalk.red(`Changes Requested: ${changesRequested} | `) +
    chalk.blue(`Inline Comments: ${totalInlineComments} | `) +
    chalk.gray(`General Comments: ${reviewer.issueComments.length}`));
  console.log('');

  // Display reviews
  if (reviewer.reviews.length > 0) {
    console.log(chalk.bold.white('  📋 Reviews:'));
    console.log(chalk.gray('  ' + THIN_DIVIDER));

    for (const review of reviewer.reviews) {
      displayReview(review);
    }
  }

  // Display issue comments
  if (reviewer.issueComments.length > 0) {
    console.log(chalk.bold.white('  💬 General Comments:'));
    console.log(chalk.gray('  ' + THIN_DIVIDER));

    for (const comment of reviewer.issueComments) {
      displayIssueComment(comment);
    }
  }

  console.log('');
}

/**
 * Display summary statistics
 */
export function displaySummary(pr: PullRequestInfo): void {
  const reviewers = Array.from(pr.reviewers.values());

  // Filter out the PR author for reviewer stats
  const actualReviewers = reviewers.filter(r => r.login !== pr.author);
  const bots = actualReviewers.filter(r => r.type === 'Bot');
  const humans = actualReviewers.filter(r => r.type === 'User');

  console.log(chalk.bold.green(DIVIDER));
  console.log(chalk.bold.green('  📊 Summary'));
  console.log(chalk.green(DIVIDER));

  console.log(chalk.white(`  Total Reviewers: ${actualReviewers.length}`));
  console.log(chalk.white(`    - Humans: ${humans.length}`));
  console.log(chalk.white(`    - Bots: ${bots.length}`));

  // Count approvals and change requests
  let totalApprovals = 0;
  let totalChangesRequested = 0;
  let totalComments = 0;

  for (const reviewer of actualReviewers) {
    for (const review of reviewer.reviews) {
      if (review.state === 'APPROVED') totalApprovals++;
      if (review.state === 'CHANGES_REQUESTED') totalChangesRequested++;
      totalComments += review.comments.length;
    }
    totalComments += reviewer.issueComments.length;
  }

  console.log('');
  console.log(chalk.green(`  ✅ Approvals: ${totalApprovals}`));
  console.log(chalk.red(`  🔴 Changes Requested: ${totalChangesRequested}`));
  console.log(chalk.blue(`  💬 Total Comments: ${totalComments}`));

  console.log(chalk.green(DIVIDER) + '\n');
}

/**
 * Display the full dashboard
 */
export function displayDashboard(pr: PullRequestInfo, options: {
  showBots?: boolean;
  showAuthor?: boolean;
  onlyReviewer?: string;
} = {}): void {
  const { showBots = true, showAuthor = true, onlyReviewer } = options;

  // Display PR header
  displayPRHeader(pr);

  // Get and filter reviewers
  let reviewers = Array.from(pr.reviewers.values());

  if (!showBots) {
    reviewers = reviewers.filter(r => r.type !== 'Bot');
  }

  if (!showAuthor) {
    reviewers = reviewers.filter(r => r.login !== pr.author);
  }

  if (onlyReviewer) {
    reviewers = reviewers.filter(r =>
      r.login.toLowerCase() === onlyReviewer.toLowerCase()
    );
  }

  // Sort reviewers: humans first, then bots, then author
  reviewers.sort((a, b) => {
    const aIsAuthor = a.login === pr.author;
    const bIsAuthor = b.login === pr.author;

    if (aIsAuthor && !bIsAuthor) return 1;
    if (!aIsAuthor && bIsAuthor) return -1;

    if (a.type === 'Bot' && b.type !== 'Bot') return 1;
    if (a.type !== 'Bot' && b.type === 'Bot') return -1;

    return a.login.localeCompare(b.login);
  });

  // Display each reviewer's comments
  for (const reviewer of reviewers) {
    displayReviewer(reviewer, pr.author);
  }

  // Display summary
  displaySummary(pr);
}

/**
 * Display a simple list of reviewers
 */
export function displayReviewerList(pr: PullRequestInfo): void {
  displayPRHeader(pr);

  console.log(chalk.bold.white('  Reviewers:\n'));

  const reviewers = Array.from(pr.reviewers.values());

  for (const reviewer of reviewers) {
    const isBot = reviewer.type === 'Bot';
    const isAuthor = reviewer.login === pr.author;

    const badges: string[] = [];
    if (isBot) badges.push(chalk.magenta('[BOT]'));
    if (isAuthor) badges.push(chalk.cyan('[AUTHOR]'));

    const latestReview = reviewer.reviews[reviewer.reviews.length - 1];
    const status = latestReview
      ? `${getStateEmoji(latestReview.state)} ${latestReview.state}`
      : '💬 Comments only';

    const totalComments = reviewer.reviews.reduce((sum, r) => sum + r.comments.length, 0)
      + reviewer.issueComments.length;

    console.log(`    ${chalk.bold(reviewer.login)} ${badges.join(' ')}`);
    console.log(chalk.gray(`      Status: ${status} | Comments: ${totalComments}`));
    console.log('');
  }
}
