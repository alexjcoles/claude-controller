// State
let prData = null;
let selectedIssues = new Map(); // Map of issueId -> issue data
let currentQuickFilter = 'all';
let allParsedIssues = []; // Store all parsed issues for selection

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
const selectionToolbar = document.getElementById('selection-toolbar');
const selectionCount = document.getElementById('selection-count');
const clearSelectionBtn = document.getElementById('clear-selection-btn');
const copySelectedBtn = document.getElementById('copy-selected-btn');

// Configure marked for markdown parsing
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

// Event Listeners
prForm.addEventListener('submit', handleSubmit);
toggleTokenBtn.addEventListener('click', toggleTokenVisibility);
showBotsCheckbox.addEventListener('change', renderReviewers);
showAuthorCheckbox.addEventListener('change', renderReviewers);
reviewerFilter.addEventListener('change', () => {
  currentQuickFilter = 'all';
  updateQuickFilterButtons();
  renderReviewers();
});
clearSelectionBtn.addEventListener('click', clearSelection);
copySelectedBtn.addEventListener('click', copySelectedAsJson);

// Quick filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentQuickFilter = btn.dataset.filter;
    updateQuickFilterButtons();
    renderReviewers();
  });
});

function updateQuickFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentQuickFilter);
  });
}

// ==================== ISSUE PARSERS ====================

/**
 * Detect reviewer type based on username
 */
function detectReviewerType(login) {
  const lowerLogin = login.toLowerCase();
  if (lowerLogin.includes('coderabbit')) return 'coderabbit';
  if (lowerLogin.includes('claude') || lowerLogin.includes('anthropic')) return 'claude';
  if (lowerLogin.includes('cursor') || lowerLogin.includes('bugbot')) return 'cursor';
  if (lowerLogin.includes('copilot')) return 'copilot';
  return 'generic';
}

/**
 * Parse CodeRabbit comment format
 */
function parseCodeRabbitComment(body, filePath, line) {
  const issues = [];

  const severityMap = {
    '🔴': 'critical',
    'critical': 'critical',
    '🟠': 'major',
    'major': 'major',
    '🟡': 'medium',
    'medium': 'medium',
    'warning': 'warning',
    '🟢': 'minor',
    'minor': 'minor',
    'low': 'low',
    '⚪': 'info',
    'info': 'info',
    'suggestion': 'suggestion',
  };

  let severity = 'info';
  const severityMatch = body.match(/\|\s*[_*]*(🔴|🟠|🟡|🟢|⚪)?\s*(Critical|Major|Medium|Minor|Low|Info|Warning|Suggestion)[_*]*/i);
  if (severityMatch) {
    const emoji = severityMatch[1];
    const text = severityMatch[2]?.toLowerCase();
    severity = severityMap[emoji] || severityMap[text] || 'info';
  }

  let title = '';
  const boldMatch = body.match(/\*\*([^*]+)\*\*/);
  if (boldMatch) {
    title = boldMatch[1].trim();
  } else {
    const lines = body.split('\n').filter(l => l.trim() && !l.startsWith('<!--'));
    if (lines.length > 0) {
      title = lines[0].replace(/^[_*⚠️🔴🟠🟡🟢⚪💡📝✅|]+\s*/g, '').trim();
      if (title.length > 80) title = title.substring(0, 80) + '...';
    }
  }

  let description = body
    .replace(/<!-- suggestion_start -->[\s\S]*?<!-- suggestion_end -->/gi, '')
    .replace(/<!-- fingerprinting[\s\S]*?-->/gi, '');

  let codeSuggestion = null;
  const suggestionMatch = body.match(/```suggestion\n([\s\S]*?)```/);
  if (suggestionMatch) {
    codeSuggestion = suggestionMatch[1];
  }

  const committableMatch = body.match(/<!-- suggestion_start -->([\s\S]*?)<!-- suggestion_end -->/i);
  if (committableMatch) {
    const suggestionContent = committableMatch[1];
    const codeMatch = suggestionContent.match(/```suggestion\n([\s\S]*?)```/);
    if (codeMatch) {
      codeSuggestion = codeMatch[1];
    }
  }

  issues.push({
    type: 'coderabbit',
    severity,
    title: title || 'Code Review Comment',
    description: description.trim(),
    filePath,
    line,
    codeSuggestion,
    raw: body,
  });

  return issues;
}

/**
 * Parse Cursor/Bugbot comment format
 */
function parseCursorComment(body, filePath, line) {
  const issues = [];

  let severity = 'info';
  const severityMatch = body.match(/<!--\s*\*\*(Critical|High|Major|Medium|Low|Minor|Info)\s*Severity\*\*\s*-->/i);
  if (severityMatch) {
    const sev = severityMatch[1].toLowerCase();
    if (sev === 'critical' || sev === 'high') severity = 'critical';
    else if (sev === 'major') severity = 'major';
    else if (sev === 'medium') severity = 'medium';
    else if (sev === 'low' || sev === 'minor') severity = 'minor';
    else severity = 'info';
  }

  let title = '';
  const titleMatch = body.match(/###\s+([^\n]+)/);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }

  let description = body;
  const descMatch = body.match(/<!-- DESCRIPTION START -->([\s\S]*?)<!-- DESCRIPTION END -->/i);
  if (descMatch) {
    description = descMatch[1].trim();
  }

  let locations = [];
  const locMatch = body.match(/<!-- LOCATIONS START\n([\s\S]*?)\nLOCATIONS END -->/i);
  if (locMatch) {
    locations = locMatch[1].trim().split('\n').filter(l => l.trim());
  }

  description = description
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<picture>[\s\S]*?<\/picture>/gi, '')
    .trim();

  if (!title && description) {
    const firstLine = description.split('\n')[0];
    title = firstLine.length > 80 ? firstLine.substring(0, 80) + '...' : firstLine;
  }

  issues.push({
    type: 'cursor',
    severity,
    title: title || 'Code Review Issue',
    description,
    filePath: filePath || (locations[0] ? locations[0].split('#')[0] : null),
    line: line || (locations[0] ? locations[0].split('#')[1]?.replace('L', '').split('-')[0] : null),
    locations,
    raw: body,
  });

  return issues;
}

/**
 * Parse Claude comment format
 */
function parseClaudeComment(body, filePath, line) {
  const issues = [];

  const numberedPattern = /(\d+)\.\s*\*\*(CRITICAL|MAJOR|HIGH|MEDIUM|LOW|MINOR|WARNING)?:?\s*([^*]+)\*\*([\s\S]*?)(?=\n\d+\.\s*\*\*|\n##|\n---|\$)/gi;
  let match;
  let foundIssues = false;

  let workingBody = body + '\n---';

  while ((match = numberedPattern.exec(workingBody)) !== null) {
    foundIssues = true;
    const severityText = (match[2] || 'info').toLowerCase();
    const title = match[3].trim();
    const content = match[4].trim();

    let severity = 'info';
    if (severityText.includes('critical')) severity = 'critical';
    else if (severityText.includes('major') || severityText.includes('high')) severity = 'major';
    else if (severityText.includes('medium') || severityText.includes('warning')) severity = 'medium';
    else if (severityText.includes('minor') || severityText.includes('low')) severity = 'minor';

    let issueFilePath = filePath;
    let issueLine = line;
    const fileMatch = content.match(/\*\*File:?\*\*:?\s*`?([^`\n]+)`?/i) ||
                      content.match(/File:?\s*`([^`]+)`/i);
    if (fileMatch) {
      const fileRef = fileMatch[1].trim();
      const linePart = fileRef.match(/:(\d+)/);
      issueFilePath = fileRef.replace(/:\d+.*$/, '');
      if (linePart) issueLine = linePart[1];
    }

    issues.push({
      type: 'claude',
      severity,
      title,
      description: content,
      filePath: issueFilePath,
      line: issueLine,
      raw: match[0],
    });
  }

  if (!foundIssues) {
    let severity = 'info';
    if (body.match(/critical/i)) severity = 'critical';
    else if (body.match(/\bmajor\b|high\s*severity/i)) severity = 'major';
    else if (body.match(/\bmedium\b|warning/i)) severity = 'medium';
    else if (body.match(/\bminor\b|\blow\b/i)) severity = 'minor';

    let title = '';
    const headerMatch = body.match(/^##?\s*([^\n]+)/m) || body.match(/\*\*([^*]+)\*\*/);
    if (headerMatch) {
      title = headerMatch[1].trim();
      if (title.length > 80) title = title.substring(0, 80) + '...';
    }

    issues.push({
      type: 'claude',
      severity,
      title: title || 'Review Comment',
      description: body,
      filePath,
      line,
      raw: body,
    });
  }

  return issues;
}

/**
 * Parse generic comment (fallback)
 */
function parseGenericComment(body, filePath, line) {
  let severity = 'info';
  let title = 'Comment';

  const boldMatch = body.match(/\*\*([^*]+)\*\*/);
  const headerMatch = body.match(/^#+\s*([^\n]+)/m);

  if (boldMatch) {
    title = boldMatch[1].trim();
  } else if (headerMatch) {
    title = headerMatch[1].trim();
  } else {
    const firstLine = body.split('\n')[0].trim();
    title = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
  }

  return [{
    type: 'generic',
    severity,
    title: title || 'Comment',
    description: body,
    filePath,
    line,
    raw: body,
  }];
}

/**
 * Parse all comments from a reviewer into unified issues
 */
function parseReviewerComments(reviewer) {
  const reviewerType = detectReviewerType(reviewer.login);
  const allIssues = [];

  for (const review of reviewer.reviews) {
    for (const comment of review.comments) {
      let issues;
      switch (reviewerType) {
        case 'coderabbit':
          issues = parseCodeRabbitComment(comment.body, comment.path, comment.line);
          break;
        case 'cursor':
          issues = parseCursorComment(comment.body, comment.path, comment.line);
          break;
        case 'claude':
          issues = parseClaudeComment(comment.body, comment.path, comment.line);
          break;
        default:
          issues = parseGenericComment(comment.body, comment.path, comment.line);
      }
      issues.forEach(issue => {
        issue.commentId = comment.id;
        issue.htmlUrl = comment.htmlUrl;
        issue.createdAt = comment.createdAt;
        issue.reviewState = review.state;
        issue.reviewer = reviewer.login;
        issue.id = `${reviewer.login}-${comment.id}-${issues.indexOf(issue)}`;
      });
      allIssues.push(...issues);
    }

    if (review.body && review.body.trim()) {
      let issues;
      switch (reviewerType) {
        case 'coderabbit':
          issues = parseCodeRabbitComment(review.body, null, null);
          break;
        case 'cursor':
          issues = parseCursorComment(review.body, null, null);
          break;
        case 'claude':
          issues = parseClaudeComment(review.body, null, null);
          break;
        default:
          issues = parseGenericComment(review.body, null, null);
      }
      issues.forEach(issue => {
        issue.reviewId = review.id;
        issue.htmlUrl = review.htmlUrl;
        issue.createdAt = review.submittedAt;
        issue.reviewState = review.state;
        issue.isReviewBody = true;
        issue.reviewer = reviewer.login;
        issue.id = `${reviewer.login}-review-${review.id}-${issues.indexOf(issue)}`;
      });
      allIssues.push(...issues);
    }
  }

  for (const comment of reviewer.issueComments) {
    let issues;
    switch (reviewerType) {
      case 'coderabbit':
        issues = parseCodeRabbitComment(comment.body, null, null);
        break;
      case 'cursor':
        issues = parseCursorComment(comment.body, null, null);
        break;
      case 'claude':
        issues = parseClaudeComment(comment.body, null, null);
        break;
      default:
        issues = parseGenericComment(comment.body, null, null);
    }
    issues.forEach(issue => {
      issue.commentId = comment.id;
      issue.htmlUrl = comment.htmlUrl;
      issue.createdAt = comment.createdAt;
      issue.isIssueComment = true;
      issue.reviewer = reviewer.login;
      issue.id = `${reviewer.login}-issue-${comment.id}-${issues.indexOf(issue)}`;
    });
    allIssues.push(...issues);
  }

  return allIssues;
}

// ==================== SELECTION MANAGEMENT ====================

function toggleIssueSelection(issueId, issue) {
  if (selectedIssues.has(issueId)) {
    selectedIssues.delete(issueId);
  } else {
    selectedIssues.set(issueId, issue);
  }
  updateSelectionUI();
}

function clearSelection() {
  selectedIssues.clear();
  updateSelectionUI();
  // Uncheck all checkboxes
  document.querySelectorAll('.issue-checkbox').forEach(cb => {
    cb.checked = false;
    cb.closest('.issue-card')?.classList.remove('selected');
  });
}

function updateSelectionUI() {
  const count = selectedIssues.size;
  selectionToolbar.hidden = count === 0;
  selectionCount.textContent = `${count} issue${count !== 1 ? 's' : ''} selected`;

  // Update card visual states
  document.querySelectorAll('.issue-card').forEach(card => {
    const checkbox = card.querySelector('.issue-checkbox');
    if (checkbox) {
      const isSelected = selectedIssues.has(checkbox.dataset.issueId);
      checkbox.checked = isSelected;
      card.classList.toggle('selected', isSelected);
    }
  });
}

function copySelectedAsJson() {
  const issues = Array.from(selectedIssues.values()).map(issue => ({
    reviewer: issue.reviewer,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    filePath: issue.filePath,
    line: issue.line,
    codeSuggestion: issue.codeSuggestion || null,
    url: issue.htmlUrl,
  }));

  const json = JSON.stringify(issues, null, 2);

  navigator.clipboard.writeText(json).then(() => {
    showToast(`Copied ${issues.length} issue${issues.length !== 1 ? 's' : ''} to clipboard`);
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('Failed to copy to clipboard');
  });
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ==================== RENDERING ====================

function toggleTokenVisibility() {
  if (tokenInput.type === 'password') {
    tokenInput.type = 'text';
    toggleTokenBtn.textContent = '🙈';
  } else {
    tokenInput.type = 'password';
    toggleTokenBtn.textContent = '👁';
  }
}

async function handleSubmit(e) {
  e.preventDefault();

  const url = prUrlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!url) return;

  setLoading(true);
  hideError();
  clearSelection();

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

function setLoading(loading) {
  fetchBtn.disabled = loading;
  fetchBtn.querySelector('.btn-text').hidden = loading;
  fetchBtn.querySelector('.btn-loading').hidden = !loading;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function hideError() {
  errorMessage.hidden = true;
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
}

function getStateClass(state) {
  const normalized = state.toLowerCase().replace('_', '-');
  if (normalized === 'open') return 'state-open';
  if (normalized === 'closed') return 'state-closed';
  if (normalized === 'merged') return 'state-merged';
  return '';
}

function renderMarkdown(text) {
  if (!text) return '';

  try {
    if (typeof marked !== 'undefined') {
      const html = marked.parse(text);
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
          ADD_TAGS: ['details', 'summary'],
          ADD_ATTR: ['open'],
        });
      }
      return html;
    }
  } catch (e) {
    console.error('Markdown parsing error:', e);
  }

  return escapeHtml(text).replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderDashboard() {
  renderPRHeader();
  renderSummary();
  populateReviewerFilter();
  renderReviewers();
  prContent.hidden = false;
}

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
      <span>Author: ${escapeHtml(prData.author)}</span>
      <span>Created: ${formatDate(prData.createdAt)}</span>
      <span>Updated: ${formatDate(prData.updatedAt)}</span>
    </div>
  `;
}

function renderSummary() {
  const reviewers = Object.values(prData.reviewers).filter(r => r.login !== prData.author);

  let approvals = 0;
  let changesRequested = 0;
  let totalIssues = 0;

  for (const reviewer of reviewers) {
    const issues = parseReviewerComments(reviewer);
    totalIssues += issues.length;

    for (const review of reviewer.reviews) {
      if (review.state === 'APPROVED') approvals++;
      if (review.state === 'CHANGES_REQUESTED') changesRequested++;
    }
  }

  const bots = reviewers.filter(r => r.type === 'Bot').length;
  const humans = reviewers.filter(r => r.type === 'User').length;

  summary.innerHTML = `
    <div class="summary-card">
      <div class="number">${reviewers.length}</div>
      <div class="label">Reviewers (${humans} humans, ${bots} bots)</div>
    </div>
    <div class="summary-card approved">
      <div class="number">${approvals}</div>
      <div class="label">Approvals</div>
    </div>
    <div class="summary-card changes">
      <div class="number">${changesRequested}</div>
      <div class="label">Changes Requested</div>
    </div>
    <div class="summary-card issues">
      <div class="number">${totalIssues}</div>
      <div class="label">Issues Found</div>
    </div>
  `;
}

function populateReviewerFilter() {
  const reviewers = Object.values(prData.reviewers);

  reviewerFilter.innerHTML = '<option value="">All reviewers</option>';

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
    if (reviewer.type === 'Bot') badges.push('Bot');
    if (reviewer.login === prData.author) badges.push('Author');
    option.textContent = `${reviewer.login}${badges.length ? ' (' + badges.join(', ') + ')' : ''}`;
    reviewerFilter.appendChild(option);
  }
}

function renderReviewers() {
  const showBots = showBotsCheckbox.checked;
  const showAuthor = showAuthorCheckbox.checked;
  const filterReviewer = reviewerFilter.value;

  let reviewers = Object.values(prData.reviewers);

  // Apply quick filter
  if (currentQuickFilter !== 'all') {
    reviewers = reviewers.filter(r => {
      const type = detectReviewerType(r.login);
      return type === currentQuickFilter;
    });
  }

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
      <div class="empty-column">
        <p>No reviewers match the current filters.</p>
      </div>
    `;
    return;
  }

  // Store all parsed issues
  allParsedIssues = [];
  reviewers.forEach(r => {
    allParsedIssues.push(...parseReviewerComments(r));
  });

  reviewersContainer.innerHTML = reviewers.map(renderReviewerColumn).join('');

  // Add event listeners for checkboxes
  document.querySelectorAll('.issue-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const issueId = e.target.dataset.issueId;
      const issue = allParsedIssues.find(i => i.id === issueId);
      if (issue) {
        toggleIssueSelection(issueId, issue);
      }
    });
  });

  // Restore selection state
  updateSelectionUI();
}

function renderReviewerColumn(reviewer) {
  const isBot = reviewer.type === 'Bot';
  const isAuthor = reviewer.login === prData.author;
  const reviewerType = detectReviewerType(reviewer.login);

  const badges = [];
  if (isBot) badges.push('<span class="badge badge-bot">BOT</span>');
  if (isAuthor) badges.push('<span class="badge badge-author">AUTHOR</span>');

  const issues = parseReviewerComments(reviewer);

  const severityCounts = {
    critical: issues.filter(i => i.severity === 'critical').length,
    major: issues.filter(i => i.severity === 'major').length,
    medium: issues.filter(i => i.severity === 'medium' || i.severity === 'warning').length,
    minor: issues.filter(i => i.severity === 'minor' || i.severity === 'low').length,
    info: issues.filter(i => i.severity === 'info' || i.severity === 'suggestion').length,
  };

  const statsHtml = `
    <span title="Critical">${severityCounts.critical > 0 ? `🔴${severityCounts.critical}` : ''}</span>
    <span title="Major">${severityCounts.major > 0 ? `🟠${severityCounts.major}` : ''}</span>
    <span title="Medium">${severityCounts.medium > 0 ? `🟡${severityCounts.medium}` : ''}</span>
    <span title="Minor">${severityCounts.minor > 0 ? `🔵${severityCounts.minor}` : ''}</span>
    <span title="Info">${severityCounts.info > 0 ? `⚪${severityCounts.info}` : ''}</span>
    <span>${issues.length} issues</span>
  `.trim();

  const issuesHtml = issues.length > 0
    ? issues.map(renderIssueCard).join('')
    : '<div class="empty-column">No issues found</div>';

  return `
    <div class="reviewer-column" data-reviewer="${escapeHtml(reviewer.login)}">
      <div class="reviewer-column-header">
        <h3>
          ${getReviewerIcon(reviewerType)} ${escapeHtml(reviewer.login)}
          ${badges.join('')}
        </h3>
        <div class="reviewer-column-stats">
          ${statsHtml}
        </div>
      </div>
      <div class="reviewer-column-content">
        ${issuesHtml}
      </div>
    </div>
  `;
}

function getReviewerIcon(type) {
  switch (type) {
    case 'coderabbit': return '🐰';
    case 'claude': return '🤖';
    case 'cursor': return '▶️';
    case 'copilot': return '🤖';
    default: return '👤';
  }
}

function renderIssueCard(issue) {
  const severityClass = `severity-${issue.severity}`;
  const severityLabel = issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1);
  const isSelected = selectedIssues.has(issue.id);

  let locationHtml = '';
  if (issue.filePath) {
    locationHtml = `
      <div class="issue-location">
        📄 ${escapeHtml(issue.filePath)}${issue.line ? `:${issue.line}` : ''}
      </div>
    `;
  }

  let descriptionHtml = '';
  if (issue.description) {
    let cleanDesc = issue.description
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<a[^>]*fix-in-cursor[^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<a[^>]*fix-in-web[^>]*>[\s\S]*?<\/a>/gi, '')
      .trim();

    descriptionHtml = `<div class="issue-description">${renderMarkdown(cleanDesc)}</div>`;
  }

  let suggestionHtml = '';
  if (issue.codeSuggestion) {
    suggestionHtml = `
      <div class="code-suggestion">
        <div class="code-suggestion-header">💡 Suggested Fix</div>
        <pre><code>${escapeHtml(issue.codeSuggestion)}</code></pre>
      </div>
    `;
  }

  let footerHtml = '';
  if (issue.createdAt || issue.htmlUrl) {
    footerHtml = `
      <div class="issue-card-footer">
        <span>${issue.createdAt ? formatDate(issue.createdAt) : ''}</span>
        <div class="issue-actions">
          ${issue.htmlUrl ? `<a href="${issue.htmlUrl}" target="_blank" class="issue-action-btn">View on GitHub</a>` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="issue-card ${isSelected ? 'selected' : ''}">
      <div class="issue-card-header">
        <input type="checkbox" class="issue-checkbox" data-issue-id="${issue.id}" ${isSelected ? 'checked' : ''}>
        <span class="severity-badge ${severityClass}">${severityLabel}</span>
        <span class="issue-title" title="${escapeHtml(issue.title)}">${escapeHtml(issue.title)}</span>
      </div>
      <div class="issue-card-body">
        ${locationHtml}
        ${descriptionHtml}
        ${suggestionHtml}
      </div>
      ${footerHtml}
    </div>
  `;
}

// Check for URL parameter
const urlParams = new URLSearchParams(window.location.search);
const prParam = urlParams.get('pr');
if (prParam) {
  prUrlInput.value = prParam;
  prForm.dispatchEvent(new Event('submit'));
}
