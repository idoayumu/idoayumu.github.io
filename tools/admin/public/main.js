const workCount = document.getElementById('workCount');
const modelCount = document.getElementById('modelCount');
const aboutImage = document.getElementById('aboutImage');
const aboutImageThumb = document.getElementById('aboutImageThumb');
const aboutImageMemo = document.getElementById('aboutImageMemo');
const heroImage = document.getElementById('heroImage');
const heroImageMemo = document.getElementById('heroImageMemo');
const heroImageMeta = document.getElementById('heroImageMeta');
const heroImageThumb = document.getElementById('heroImageThumb');
const summaryMessage = document.getElementById('summaryMessage');
const fallbackHeroImage = '/images/site/top-hero.webp';
const fallbackHeroSeason = 'spring';
const fallbackHeroYear = 2026;
const fallbackHeroMemo = '管理ツール導入前';

function fileNameFromPath(value) {
  const text = String(value || '').trim();
  if (!text) return '未設定';
  return text.split('/').filter(Boolean).at(-1) || text;
}

async function loadSummary() {
  try {
    const resp = await fetch('./api/summary');
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.message || resp.statusText);

    const summary = json.summary;
    const currentAboutImage = summary.aboutImage || '';
    const currentHeroImage = summary.heroImage || fallbackHeroImage;
    const currentHeroSeason = summary.heroImageSeason || fallbackHeroSeason;
    const currentHeroYear = summary.heroImageYear || fallbackHeroYear;
    const currentHeroMemo = summary.heroImageMemo || (currentHeroImage === fallbackHeroImage ? fallbackHeroMemo : '未設定');

    workCount.textContent = `${summary.workCount} 件`;
    modelCount.textContent = `${summary.modelCount} 人`;
    aboutImage.textContent = fileNameFromPath(currentAboutImage);
    aboutImageThumb.src = currentAboutImage;
    aboutImageMemo.textContent = summary.aboutImageMemo || '未設定';
    heroImageMemo.textContent = currentHeroMemo;
    heroImage.textContent = currentHeroImage;
    heroImageMeta.textContent = `${currentHeroSeason} / ${currentHeroYear}`;
    heroImageThumb.src = currentHeroImage;
    summaryMessage.textContent = '';
  } catch (err) {
    console.error(err);
    workCount.textContent = '-';
    modelCount.textContent = '-';
    aboutImage.textContent = '-';
    aboutImageThumb.removeAttribute('src');
    aboutImageMemo.textContent = '-';
    heroImage.textContent = '-';
    heroImageMemo.textContent = '-';
    heroImageMeta.textContent = '-';
    heroImageThumb.removeAttribute('src');
    summaryMessage.textContent = '管理情報を読み込めませんでした。';
  }
}

loadSummary();
