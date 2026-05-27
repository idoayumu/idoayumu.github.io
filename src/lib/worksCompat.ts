import works from '../data/works.json';

export type Work = any;

export function getAllWorks(): Work[] {
  return works as any[];
}

// モデルIDの配列を取得（models または modelIds）
export function getWorkModelIds(w: any): string[] {
  if (Array.isArray(w.modelIds)) return w.modelIds;
  if (Array.isArray(w.models)) return w.models;
  return [];
}

// メイン画像のURL（既存は files[0].name を使っている想定）
export function getWorkImageUrl(w: any): string | null {
  if (typeof w.image === 'string') return w.image; // /images/works/large/....webp
  if (Array.isArray(w.files) && w.files[0]?.name) {
    // 既存の配置に合わせて、public 側の格納場所の規則があればここで付与
    // 例: /images/works/<name>
    return `/images/works/large/${w.files[0].name}`;
  }
  return null;
}

// サムネイルURL
export function getWorkThumbUrl(w: any): string | null {
  if (typeof w.thumbnail === 'string') return w.thumbnail;
  // 既存サムネの規則があればここに追記
  return null;
}
