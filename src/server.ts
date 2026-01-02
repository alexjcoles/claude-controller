import express, { Request, Response } from 'express';
import path from 'path';
import * as dotenv from 'dotenv';
import { GitHubClient } from './github';
import { PullRequestInfo, Reviewer, Review, ReviewComment, IssueComment } from './types';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Convert Map to plain object for JSON serialization
function serializePRData(pr: PullRequestInfo): any {
  const reviewers: Record<string, any> = {};
  pr.reviewers.forEach((reviewer, login) => {
    reviewers[login] = reviewer;
  });

  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    author: pr.author,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    htmlUrl: pr.htmlUrl,
    reviewers,
  };
}

// API endpoint to fetch PR data
app.get('/api/pr', async (req: Request, res: Response) => {
  const { url, token } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing PR URL parameter' });
  }

  const githubToken = (token as string) || process.env.GITHUB_TOKEN;

  if (!githubToken) {
    return res.status(401).json({
      error: 'GitHub token required',
      message: 'Set GITHUB_TOKEN environment variable or pass token query parameter'
    });
  }

  try {
    const client = new GitHubClient(githubToken);
    const parsed = client.parsePRReference(url);
    const prData = await client.fetchPRComments(parsed);

    res.json(serializePRData(prData));
  } catch (error: any) {
    if (error.status === 404) {
      return res.status(404).json({ error: 'PR not found' });
    } else if (error.status === 401) {
      return res.status(401).json({ error: 'Authentication failed. Check your GitHub token.' });
    } else if (error.status === 403) {
      return res.status(403).json({ error: 'Access forbidden. Token may lack permissions.' });
    }

    console.error('Error fetching PR:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch PR data' });
  }
});

// Serve the main page
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 PR Review Dashboard running at http://localhost:${PORT}\n`);
  if (!process.env.GITHUB_TOKEN) {
    console.log('⚠️  No GITHUB_TOKEN environment variable set.');
    console.log('   You can pass a token via the UI or set GITHUB_TOKEN in your .env file.\n');
  }
});
