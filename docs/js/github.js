;(function () {
  'use strict'

  const REPO = 'Boc86/fynix-player'

  async function fetchJSON(url) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      console.warn('GitHub API fetch failed:', err.message)
      return null
    }
  }

  function formatNumber(n) {
    if (!n && n !== 0) return '—'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return String(n)
  }

  function timeAgo(dateStr) {
    if (!dateStr) return ''
    const now = new Date()
    const date = new Date(dateStr)
    const diff = Math.floor((now - date) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago'
    return date.toLocaleDateString()
  }

  async function loadGitHubStats() {
    const repoData = await fetchJSON(`https://api.github.com/repos/${REPO}`)
    const releasesData = await fetchJSON(`https://api.github.com/repos/${REPO}/releases/latest`)
    const commitsData = await fetchJSON(`https://api.github.com/repos/${REPO}/commits?per_page=1`)

    const latestRelease = releasesData ? releasesData.tag_name : null
    const latestCommit = commitsData && commitsData[0] ? commitsData[0] : null

    const stats = {
      stars: repoData ? formatNumber(repoData.stargazers_count) : '—',
      forks: repoData ? formatNumber(repoData.forks_count) : '—',
      license: repoData && repoData.license ? repoData.license.spdx_id : 'MIT',
      version: latestRelease || '—',
      commitSha: latestCommit ? latestCommit.sha.slice(0, 7) : '—',
      commitMsg: latestCommit ? latestCommit.commit.message.split('\n')[0].slice(0, 50) : '—',
      commitDate: latestCommit ? timeAgo(latestCommit.commit.committer.date) : '',
    }

    const els = {
      stars: document.getElementById('gh-stars'),
      forks: document.getElementById('gh-forks'),
      license: document.getElementById('gh-license'),
      version: document.getElementById('gh-version'),
      commit: document.getElementById('gh-commit'),
      commitDate: document.getElementById('gh-commit-date'),
    }

    if (els.stars) els.stars.textContent = stats.stars
    if (els.forks) els.forks.textContent = stats.forks
    if (els.license) els.license.textContent = stats.license
    if (els.version) els.version.textContent = stats.version
    if (els.commit) els.commit.textContent = stats.commitSha
    if (els.commitDate) els.commitDate.textContent = stats.commitDate ? '· ' + stats.commitDate : ''

    const releaseBtn = document.getElementById('latest-release-btn')
    if (releaseBtn && releasesData && releasesData.html_url) {
      releaseBtn.href = releasesData.html_url
    }
  }

  document.addEventListener('DOMContentLoaded', loadGitHubStats)
})()
