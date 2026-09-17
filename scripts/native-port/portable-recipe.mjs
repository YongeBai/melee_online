import fs from 'node:fs';import {createHash} from 'node:crypto';
export function portableRecipeHash(){const hash=createHash('sha256');for(const name of ['./portable-source.mjs','../../engines/browser-native/menu-product.inc','../../engines/browser-native/stage-menu-product.inc'])hash.update(fs.readFileSync(new URL(name,import.meta.url)));return hash.digest('hex');}
