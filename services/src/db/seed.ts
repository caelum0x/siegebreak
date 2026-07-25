import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Representative starter roster, not the full launch set (PRD targets
// 6-8 heroes / 30-40 support cards). Enough to exercise deck validation,
// the elixir curve, and every targeting type (ground, air, buildings-only).
const cards = [
  { id: "hero_vanguard", name: "Vanguard", type: "hero", elixirCost: 5, baseStats: { hp: 900, dps: 60, ability: "shield_bash", abilityCooldownSeconds: 8 } },
  { id: "hero_ranger", name: "Ranger", type: "hero", elixirCost: 5, baseStats: { hp: 650, dps: 45, ability: "smoke_dash", abilityCooldownSeconds: 10 } },
  { id: "troop_shieldbearer", name: "Shieldbearer", type: "troop", elixirCost: 3, baseStats: { hp: 400, dps: 20, count: 1, targets: "ground" } },
  { id: "troop_swarm", name: "Swarm", type: "troop", elixirCost: 2, baseStats: { hp: 60, dps: 15, count: 4, targets: "ground_air" } },
  { id: "troop_siege_ram", name: "Siege Ram", type: "troop", elixirCost: 5, baseStats: { hp: 800, dps: 90, count: 1, targets: "buildings_only" } },
  { id: "troop_archer", name: "Archer", type: "troop", elixirCost: 3, baseStats: { hp: 150, dps: 30, count: 2, targets: "ground_air", range: 6 } },
  { id: "troop_skirmisher", name: "Skirmisher", type: "troop", elixirCost: 4, baseStats: { hp: 350, dps: 40, count: 1, targets: "ground" } },
  { id: "building_turret", name: "Turret", type: "building", elixirCost: 4, baseStats: { hp: 500, dps: 35, range: 7, lifespanSeconds: 30 } },
  { id: "spell_firebomb", name: "Firebomb", type: "spell", elixirCost: 4, baseStats: { damage: 200, radius: 3 } },
  { id: "spell_rally_heal", name: "Rally Heal", type: "spell", elixirCost: 3, baseStats: { healAmount: 250, radius: 4 } },
];

async function main() {
  for (const card of cards) {
    await prisma.card.upsert({ where: { id: card.id }, update: card, create: card });
  }
  console.log(`Seeded ${cards.length} cards.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
