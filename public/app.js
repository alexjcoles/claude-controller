// State
let prData = null;

// DOM Elements
const prForm = document.getElementById('pr-form');
const prUrlInput = document.getElementById('pr-url');
const tokenInput = document.getElementById('github-token');
const toggleTokenBtn = document.getElementById('toggle-token');
const fetchBtn = document.getElementById('fetch-btn');
const errorMessage = document.getElementById('error-message');
const prContent = document.getElementById('pr-content');
const prHeader = document.getElementById('pr-header');
const summary = document.getElementById('summary');
const reviewersContainer = document.getElementById('reviewers-container');
const showBotsCheckbox = document.getElementById('show-bots');
const showAuthorCheckbox = document.getElementById('show-author');
const reviewerFilter = document.getElementById('reviewer-filter');

// Event Listeners
prForm.addEventListener('submit', handleSubmit);
toggleTokenBtn.addEventListener('click', toggleTokenVisibility);
showBotsCheckbox.addEventListener('change', renderReviewers);
showAuthorCheckbox.addEventListener('change', renderReviewers);
reviewerFilter.addEventListener('change', renderReviewers);

// Toggle token visibility
function toggleTokenVisibility() {
  if (tokenInput.type === 'password') {
    tokenInput.type = 'text';
    toggleTokenBtn.textContent = '🙈';
  } else {
    tokenInput.type = 'password';
    toggleTokenBtn.textContent = '👁';
  }
}

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();

  const url = prUrlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!url) return;

  setLoading(true);
  hideError();

  try {
    const params = new URLSearchParams({ url });
    if (token) params.append('token', token);

    const response = await fetch(`/api/pr?${params}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch PR');
    }

    prData = data;
    renderDashboard();
  } catch (error) {
    showError(error.message);
    prContent.hidden = true;
  } finally {
    setLoading(false);
  }
}

// Set loading state
function setLoading(loading) {
  fetchBtn.disabled = loading;
  fetchBtn.querySelector('.btn-text').hidden = loading;
  fetchBtn.querySelector('.btn-loading').hidden = !loading;
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

// Hide error message
function hideError() {
  errorMessage.hidden = true;
}

// Format date
function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

// Get state class
function getStateClass(state) {
  const normalized = state.toLowerCase().replace('_', '-');
  if (normalized === 'open') return 'state-open';
  if (normalized === 'closed') return 'state-closed';
  if (normalized === 'merged') return 'state-merged';
  return '';
}

// Get review state emoji
function getReviewStateEmoji(state) {
  switch (state) {
    case 'APPROVED': return '✅';
    case 'CHANGES_REQUESTED': return '🔴';
    case 'COMMENTED': return '💬';
    case 'PENDING': return '⏳';
    case 'DISMISSED': return '🚫';
    default: return '📝';
  }
}

// Render the entire dashboard
function renderDashboard() {
  renderPRHeader();
  renderSummary();
  populateReviewerFilter();
  renderReviewers();
  prContent.hidden = false;
}

// Render PR header
function renderPRHeader() {
  const stateClass = getStateClass(prData.state);

  prHeader.innerHTML = `
    <h2>
      <a href="${prData.htmlUrl}" target="_blank" rel="noopener">
        #${prData.number}: ${escapeHtml(prData.title)}
      </a>
    </h2>
    <div class="pr-meta">
      <span><span class="state-badge ${stateClass}">${prData.state}</span></span>
      <span>👤 ${escapeHtml(prData.author)}</span>
      <span>📅 Created: ${formatDate(prData.createdAt)}</span>
      <span>🔄 Updated: ${formatDate(prData.updatedAt)}</span>
    </div>
  `;
}

// Render summary cards
function renderSummary() {
  const reviewers = Object.values(prData.reviewers).filter(r => r.login !== prData.author);

  let approvals = 0;
  let changesRequested = 0;
  let totalComments = 0;

  for (const reviewer of reviewers) {
    for (const review of reviewer.reviews) {
      if (review.state === 'APPROVED') approvals++;
      if (review.state === 'CHANGES_REQUESTED') changesRequested++;
      totalComments += review.comments.length;
    }
    totalComments += reviewer.issueComments.length;
  }

  const bots = reviewers.filter(r => r.type === 'Bot').length;
  const humans = reviewers.filter(r => r.type === 'User').length;

  summary.innerHTML = `
    <div class="summary-card">
      <div class="number">${reviewers.length}</div>
      <div class="label">Reviewers (${humans} 👤 / ${bots} 🤖)</div>
    </div>
    <div class="summary-card approved">
      <div class="number">${approvals}</div>
      <div class="label">Approvals</div>
    </div>
    <div class="summary-card changes">
      <div class="number">${changesRequested}</div>
      <div class="label">Changes Requested</div>
    </div>
    <div class="summary-card comments">
      <div class="number">${totalComments}</div>
      <div class="label">Comments</div>
    </div>
  `;
}

// Populate reviewer filter dropdown
function populateReviewerFilter() {
  const reviewers = Object.values(prData.reviewers);

  // Clear existing options except the first one
  reviewerFilter.innerHTML = '<option value="">All reviewers</option>';

  // Sort: humans first, then bots, then author
  reviewers.sort((a, b) => {
    const aIsAuthor = a.login === prData.author;
    const bIsAuthor = b.login === prData.author;
    if (aIsAuthor && !bIsAuthor) return 1;
    if (!aIsAuthor && bIsAuthor) return -1;
    if (a.type === 'Bot' && b.type !== 'Bot') return 1;
    if (a.type !== 'Bot' && b.type === 'Bot') return -1;
    return a.login.localeCompare(b.login);
  });

  for (const reviewer of reviewers) {
    const option = document.createElement('option');
    option.value = reviewer.login;
    const badges = [];
    if (reviewer.type === 'Bot') badges.push('🤖');
    if (reviewer.login === prData.author) badges.push('👤 Author');
    option.textContent = `${reviewer.login}${badges.length ? ' ' + badges.join(' ') : ''}`;
    reviewerFilter.appendChild(option);
  }
}

// Render reviewers
function renderReviewers() {
  const showBots = showBotsCheckbox.checked;
  const showAuthor = showAuthorCheckbox.checked;
  const filterReviewer = reviewerFilter.value;

  let reviewers = Object.values(prData.reviewers);

  // Apply filters
  if (!showBots) {
    reviewers = reviewers.filter(r => r.type !== 'Bot');
  }
  if (!showAuthor) {
    reviewers = reviewers.filter(r => r.login !== prData.author);
  }
  if (filterReviewer) {
    reviewers = reviewers.filter(r => r.login === filterReviewer);
  }

  // Sort: humans first, then bots, author last
  reviewers.sort((a, b) => {
    const aIsAuthor = a.login === prData.author;
    const bIsAuthor = b.login === prData.author;
    if (aIsAuthor && !bIsAuthor) return 1;
    if (!aIsAuthor && bIsAuthor) return -1;
    if (a.type === 'Bot' && b.type !== 'Bot') return 1;
    if (a.type !== 'Bot' && b.type === 'Bot') return -1;
    return a.login.localeCompare(b.login);
  });

  if (reviewers.length === 0) {
    reviewersContainer.innerHTML = `
      <div class="loading">
        <p>No reviewers match the current filters.</p>
      </div>
    `;
    return;
  }

  reviewersContainer.innerHTML = reviewers.map(renderReviewerCard).join('');

  // Add click handlers for collapsible cards
  document.querySelectorAll('.reviewer-header').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.reviewer-card');
      card.classList.toggle('collapsed');
    });
  });
}

// Render a single reviewer card
function renderReviewerCard(reviewer) {
  const isBot = reviewer.type === 'Bot';
  const isAuthor = reviewer.login === prData.author;

  const badges = [];
  if (isBot) badges.push('<span class="badge badge-bot">BOT</span>');
  if (isAuthor) badges.push('<span class="badge badge-author">AUTHOR</span>');

  // Calculate stats
  const approvals = reviewer.reviews.filter(r => r.state === 'APPROVED').length;
  const changesRequested = reviewer.reviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
  const inlineComments = reviewer.reviews.reduce((sum, r) => sum + r.comments.length, 0);
  const generalComments = reviewer.issueComments.length;

  const reviewsHtml = reviewer.reviews.map(renderReview).join('');
  const issueCommentsHtml = renderIssueComments(reviewer.issueComments);

  return `
    <div class="reviewer-card">
      <div class="reviewer-header">
        <div class="reviewer-info">
          <h3>👤 ${escapeHtml(reviewer.login)}</h3>
          ${badges.join('')}
        </div>
        <div class="reviewer-stats">
          <span>📋 ${reviewer.reviews.length} reviews</span>
          <span style="color: var(--accent-green)">✅ ${approvals}</span>
          <span style="color: var(--accent-red)">🔴 ${changesRequested}</span>
          <span style="color: var(--accent-blue)">💬 ${inlineComments + generalComments}</span>
          <span class="expand-icon">▼</span>
        </div>
      </div>
      <div class="reviewer-content">
        ${reviewsHtml}
        ${issueCommentsHtml}
        ${!reviewsHtml && !issueCommentsHtml ? '<p style="color: var(--text-muted)">No comments from this reviewer.</p>' : ''}
      </div>
    </div>
  `;
}

// Render a single review
function renderReview(review) {
  const stateClass = review.state.toLowerCase();
  const emoji = getReviewStateEmoji(review.state);

  let bodyHtml = '';
  if (review.body && review.body.trim()) {
    bodyHtml = `<div class="review-body">${escapeHtml(review.body)}</div>`;
  }

  let commentsHtml = '';
  if (review.comments.length > 0) {
    commentsHtml = `
      <div class="inline-comments">
        <h4>📁 Inline Comments (${review.comments.length})</h4>
        ${review.comments.map(renderInlineComment).join('')}
      </div>
    `;
  }

  return `
    <div class="review">
      <div class="review-header">
        <span class="review-state ${stateClass}">${emoji} ${review.state.replace('_', ' ')}</span>
        ${review.submittedAt ? `<span class="review-date">${formatDate(review.submittedAt)}</span>` : ''}
      </div>
      ${bodyHtml}
      ${commentsHtml}
    </div>
  `;
}

// Render an inline comment
function renderInlineComment(comment) {
  const fileInfo = comment.path
    ? `<div class="comment-file">📄 ${escapeHtml(comment.path)}${comment.line ? `:${comment.line}` : ''}</div>`
    : '';

  const replyIndicator = comment.inReplyToId
    ? '<span class="reply-indicator">↩ Reply</span>'
    : '';

  return `
    <div class="inline-comment">
      ${fileInfo}
      <div class="comment-body">${escapeHtml(comment.body)}</div>
      <div class="comment-meta">
        ${formatDate(comment.createdAt)}${replyIndicator}
      </div>
    </div>
  `;
}

// Render issue comments
function renderIssueComments(comments) {
  if (comments.length === 0) return '';

  return `
    <div class="issue-comments">
      <h4>💬 General Comments (${comments.length})</h4>
      ${comments.map(comment => `
        <div class="issue-comment">
          <div class="comment-body">${escapeHtml(comment.body)}</div>
          <div class="comment-meta">${formatDate(comment.createdAt)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Check for URL parameter
const urlParams = new URLSearchParams(window.location.search);
const prParam = urlParams.get('pr');
if (prParam) {
  prUrlInput.value = prParam;
  prForm.dispatchEvent(new Event('submit'));
}
