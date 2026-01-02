export interface ReviewComment {
  id: number;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  inReplyToId?: number;
}

export interface Review {
  id: number;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED';
  body: string | null;
  submittedAt: string | null;
  htmlUrl: string;
  comments: ReviewComment[];
}

export interface IssueComment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface Reviewer {
  login: string;
  avatarUrl?: string;
  type: 'User' | 'Bot';
  reviews: Review[];
  issueComments: IssueComment[];
}

export interface PullRequestInfo {
  number: number;
  title: string;
  state: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  reviewers: Map<string, Reviewer>;
}

export interface ParsedPR {
  owner: string;
  repo: string;
  pullNumber: number;
}
