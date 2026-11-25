// Lists the installers of the latest published release. Without a release, or if the
// GitHub API cannot be reached, the static text in the page stays.
(async () => {
  const container = document.getElementById('downloads');
  const status = document.getElementById('status');
  const platforms = [
    { key: 'win', title: 'Windows', match: (name) => /-win-/.test(name) },
    { key: 'mac', title: 'macOS', match: (name) => /-mac-/.test(name) },
    { key: 'linux', title: 'Linux', match: (name) => /-linux-/.test(name) }
  ];
  const label = (name) => {
    if (name.endsWith('-setup.exe')) return 'Installer (.exe)';
    if (name.endsWith('.dmg')) return `Disk image, ${name.includes('arm64') ? 'Apple silicon' : 'Intel'} (.dmg)`;
    if (name.endsWith('.AppImage')) return 'AppImage';
    if (name.endsWith('.tar.gz')) return 'Archive (.tar.gz)';
    if (name.endsWith('.zip')) return `Portable archive${name.includes('arm64') ? ', Apple silicon' : name.includes('-mac-') ? ', Intel' : ''} (.zip)`;
    return name;
  };
  const userPlatform = /Windows/i.test(navigator.userAgent) ? 'win' : /Mac/i.test(navigator.userAgent) ? 'mac' : /Linux/i.test(navigator.userAgent) ? 'linux' : '';

  let release;
  try {
    const response = await fetch('https://api.github.com/repos/gafapa/moodlia-analyzer/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return;
    release = await response.json();
  } catch {
    return;
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (assets.length === 0) return;

  const version = String(release.tag_name || '').replace(/^v/, '');
  status.textContent = `Version ${version} is available.`;
  container.replaceChildren();
  for (const platform of platforms) {
    const files = assets.filter((asset) => platform.match(asset.name));
    if (files.length === 0) continue;
    const card = document.createElement('div');
    card.className = `platform${platform.key === userPlatform ? ' current' : ''}`;
    const heading = document.createElement('h3');
    heading.textContent = platform.title;
    const list = document.createElement('ul');
    for (const file of files) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = file.browser_download_url;
      link.textContent = label(file.name);
      const size = document.createElement('span');
      size.className = 'size';
      size.textContent = ` ${(file.size / 1048576).toFixed(0)} MB`;
      item.append(link, size);
      list.append(item);
    }
    card.append(heading, list);
    if (platform.key === userPlatform) container.prepend(card); else container.append(card);
  }
  const checksums = assets.find((asset) => asset.name.startsWith('SHA256SUMS'));
  const footer = document.createElement('p');
  footer.append('All files and release notes: ');
  const all = document.createElement('a');
  all.href = release.html_url;
  all.textContent = `release ${version}`;
  footer.append(all);
  if (checksums) {
    footer.append('. Checksums: ');
    const sums = document.createElement('a');
    sums.href = checksums.browser_download_url;
    sums.textContent = checksums.name;
    footer.append(sums);
  }
  footer.append('.');
  container.append(footer);
})();
