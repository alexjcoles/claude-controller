import { Octokit } from '@octokit/rest';
import {
  ParsedPR,
  PullRequestInfo,
  Reviewer,
  Review,
  ReviewComment,
  IssueComment,
} from './types';

export class GitHubClient {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
  }

  /**
   * Parse a PR URL or reference into owner, repo, and PR number
   * Supports formats:
   * - https://github.com/owner/repo/pull/123
   * - owner/repo#123
   * - owner/repo/123
   */
  parsePRReference(input: string): ParsedPR {
    // URL format: https://github.com/owner/repo/pull/123
    const urlMatch = input.match(
      /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    );
    if (urlMatch) {
      return {
        owner: urlMatch[1],
        repo: urlMatch[2],
        pullNumber: parseInt(urlMatch[3], 10),
      };
    }

    // Short format: owner/repo#123
    const shortMatch = input.match(/^([^/]+)\/([^#]+)#(\d+)$/);
    if (shortMatch) {
      return {
        owner: shortMatch[1],
        repo: shortMatch[2],
        pullNumber: parseInt(shortMatch[3], 10),
      };
    }

    // Slash format: owner/repo/123
    const slashMatch = input.match(/^([^/]+)\/([^/]+)\/(\d+)$/);
    if (slashMatch) {
      return {
        owner: slashMatch[1],
        repo: slashMatch[2],
        pullNumber: parseInt(slashMatch[3], 10),
      };
    }

    throw new Error(
      `Invalid PR reference: ${input}. Use format: owner/repo#123 or GitHub URL`
    );
  }

  /**
   * Fetch all PR data and organize by reviewer
   */
  async fetchPRComments(parsed: ParsedPR): Promise<PullRequestInfo> {
    const { owner, repo, pullNumber } = parsed;

    // Fetch PR details
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // Fetch all reviews
    const { data: reviews } = await this.octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    // Fetch all review comments (inline comments on code)
    const { data: reviewComments } =
      await this.octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
      });

    // Fetch issue comments (general PR comments)
    const { data: issueComments } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
    });

    // Organize by reviewer
    const reviewerMap = new Map<string, Reviewer>();

    // Helper to get or create reviewer
    const getReviewer = (login: string, type: 'User' | 'Bot' = 'User'): Reviewer => {
      if (!reviewerMap.has(login)) {
        reviewerMap.set(login, {
          login,
          type,
          reviews: [],
          issueComments: [],
        });
      }
      return reviewerMap.get(login)!;
    };

    // Create a map of review ID to review comments
    const reviewCommentsMap = new Map<number, ReviewComment[]>();
    for (const comment of reviewComments) {
      const reviewId = comment.pull_request_review_id;
      if (reviewId) {
        if (!reviewCommentsMap.has(reviewId)) {
          reviewCommentsMap.set(reviewId, []);
        }
        reviewCommentsMap.get(reviewId)!.push({
          id: comment.id,
          body: comment.body,
          path: comment.path,
          line: comment.line || comment.original_line || undefined,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          htmlUrl: comment.html_url,
          inReplyToId: comment.in_reply_to_id,
        });
      }
    }

    // Process reviews
    for (const review of reviews) {
      if (!review.user) continue;

      const reviewer = getReviewer(
        review.user.login,
        review.user.type === 'Bot' ? 'Bot' : 'User'
      );

      const reviewObj: Review = {
        id: review.id,
        state: review.state as Review['state'],
        body: review.body,
        submittedAt: review.submitted_at || null,
        htmlUrl: review.html_url,
        comments: reviewCommentsMap.get(review.id) || [],
      };

      reviewer.reviews.push(reviewObj);
    }

    // Process issue comments
    for (const comment of issueComments) {
      if (!comment.user) continue;

      // Skip the PR author's comments if they're not a reviewer
      const reviewer = getReviewer(
        comment.user.login,
        comment.user.type === 'Bot' ? 'Bot' : 'User'
      );

      reviewer.issueComments.push({
        id: comment.id,
        body: comment.body || '',
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        htmlUrl: comment.html_url,
      });
    }

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login || 'unknown',
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      htmlUrl: pr.html_url,
      reviewers: reviewerMap,
    };
  }
}
