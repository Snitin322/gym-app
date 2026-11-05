import { kcalFromMacros, type FoodUnit } from '@onthec/shared'

type Starter = [name: string, unit: FoodUnit, pieceName: string | null, proteinG: number, carbsG: number, fatG: number]

/**
 * Common foods with typical values (per 100 g / 100 ml / piece), so a coach can start planning at once.
 * Approximate: labels and recipes vary, and coaches can edit any of them.
 */
const FOODS: Starter[] = [
  // Protein
  ['Chicken breast (cooked)', 'g', null, 31, 0, 3.6],
  ['Fish, lean (cooked)', 'g', null, 22, 0, 2.5],
  ['Egg (whole)', 'piece', 'egg', 6.3, 0.6, 5],
  ['Egg white', 'piece', 'egg white', 3.6, 0.2, 0],
  ['Paneer', 'g', null, 18, 1.2, 20.8],
  ['Tofu', 'g', null, 8, 1.9, 4.8],
  ['Soya chunks (dry)', 'g', null, 52, 33, 0.5],
  ['Whey protein', 'piece', 'scoop', 24, 3, 1.5],
  ['Greek yogurt (plain)', 'g', null, 10, 3.6, 0.4],
  ['Curd (dahi)', 'g', null, 3.5, 4.7, 3.3],
  ['Milk (toned)', 'ml', null, 3.1, 4.7, 3],
  ['Buttermilk (chaas)', 'ml', null, 1.4, 2.1, 0.6],
  // Dals and legumes (cooked)
  ['Dal (cooked lentils)', 'g', null, 9, 20, 0.4],
  ['Rajma (cooked)', 'g', null, 8.7, 22.8, 0.5],
  ['Chana (cooked chickpeas)', 'g', null, 8.9, 27, 2.6],
  ['Moong sprouts', 'g', null, 3, 6, 0.2],
  // Grains
  ['Rice, white (cooked)', 'g', null, 2.7, 28, 0.3],
  ['Rice, brown (cooked)', 'g', null, 2.6, 23, 0.9],
  ['Roti / chapati', 'piece', 'roti', 3.1, 18, 2.5],
  ['Oats (dry)', 'g', null, 13.2, 67.7, 6.5],
  ['Poha (dry)', 'g', null, 6.6, 77, 1.2],
  ['Bread, whole wheat', 'piece', 'slice', 3.6, 12, 1],
  ['Idli', 'piece', 'idli', 2, 8, 0.2],
  ['Dosa (plain)', 'piece', 'dosa', 3.9, 29, 3.7],
  // Vegetables and fruit
  ['Potato (boiled)', 'g', null, 2, 20, 0.1],
  ['Sweet potato (boiled)', 'g', null, 1.4, 17.7, 0.1],
  ['Green vegetables (cooked)', 'g', null, 2.5, 7, 0.3],
  ['Salad (cucumber, tomato, onion)', 'g', null, 1, 4, 0.2],
  ['Banana', 'piece', 'banana', 1.3, 27, 0.4],
  ['Apple', 'piece', 'apple', 0.5, 25, 0.3],
  // Fats, nuts and extras
  ['Almonds', 'g', null, 21, 22, 50],
  ['Peanuts', 'g', null, 26, 16, 49],
  ['Peanut butter', 'g', null, 25, 20, 50],
  ['Ghee', 'g', null, 0, 0, 100],
  ['Cooking oil', 'g', null, 0, 0, 100],
  ['Honey', 'g', null, 0.3, 82, 0],
]

export const STARTER_FOODS = FOODS.map(([name, unit, pieceName, proteinG, carbsG, fatG]) => ({
  name,
  unit,
  pieceName,
  proteinG,
  carbsG,
  fatG,
  kcal: kcalFromMacros(proteinG, carbsG, fatG),
}))
