import path from 'node:path';
import {validateCatalogDirectory} from './catalog-lib.mjs';
const root=path.resolve(process.argv[2]??'public/catalog');
const index=validateCatalogDirectory(root);
console.log(`Validated official LyricForge catalog with ${index.items.length} assets.`);
