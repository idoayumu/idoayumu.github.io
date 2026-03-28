// src/types/index.ts

export interface ModelLinks {
  instagram?: string;
  twitter?: string;
  website?: string;
}

export interface Model {
  id: string;
  name: string;
  nameKana: string;
  nameEn: string;
  aliases: string[];
  bio: string;
  thumbnail: string;
  links: ModelLinks;
  featured: boolean;
}

export interface WorkFile {
  name: string;
  alt: string;
}

export interface WorkEquipment {
  camera?: string;
  lens?: string;
}

export interface WorkLinks {
  instagram?: string;
}

export interface Work {
  id: string;
  title: string;
  models: string[]; // Model.id の配列
  files: WorkFile[];
  date: string;     // YYYY-MM-DD
  tags: string[];
  equipment: WorkEquipment;
  links: WorkLinks;
  featured: boolean;
}
