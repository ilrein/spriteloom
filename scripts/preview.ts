// Print every example sprite as ASCII. Run: bun scripts/preview.ts [name]
import { runRecipe, toAscii } from "../src/engine/engine";
import { EXAMPLES } from "../src/engine/examples";
import { validateRecipe } from "../src/engine/validate";

const only = process.argv[2];
for (const recipe of EXAMPLES) {
  if (only && recipe.name !== only) continue;
  const errors = validateRecipe(recipe);
  console.log(`\n=== ${recipe.name} (${recipe.size}x${recipe.size}) ===`);
  if (errors.length > 0) {
    console.log("INVALID:", errors.join("; "));
    continue;
  }
  console.log(toAscii(runRecipe(recipe)));
}
