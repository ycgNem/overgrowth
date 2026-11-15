# Overgrowth 1.1.0: playthrough review

Reviewed 2026-11-13 on `main` at 5614ec6. Report only: no game code was changed.

## Verdict

Overgrowth is an unusually complete prototype with a strong first impression (title, menus, satchel, night lighting), but it is not yet a game people will replay.
Three things hold it back, in this order:

1. **The day has no decisions after its first third.** Materials are abundant and the root cap fills about 80 seconds into a 270-second day.
2. **Nights 1 and 2 carry no threat, and from night 7 only one build wins.** The curve is flat, flat, cliff, and bow towers dominate.
3. **Save and Continue can be exploited and can also punish honest players.** Continue rewinds the day to dawn and regrows the Blight Blooms.

## How it was tested

| Source | What it covered |
| --- | --- |
| My playthrough | Title, menus, Field Guide, settings, intro card; day 1 foraging, cutting and placing; night 1 with the machete; Bloom, crates, death and pack recovery; camp stations, offering, boons, crafting UI, placement rules, root cap; nights 5 and 10 and the victory card; HUD at four resolutions |
| Indie critic | Honest bot runs of nights 1 to 3 on all three difficulties; debug samples of nights 5, 10 and 13; ending cards; the real save and Continue flow; the repo's own e2e scripts |
| Core code audit | All of `Game.ts`, save, inventory, HUD, input, journal, expedition; `npm run typecheck` |
| Defence code audit | Enemies, towers, waves, flow field, Blooms; live probes and about 20 simulated nights |

Each finding is marked **reproduced** (seen in the running game) or **code** (read from the source, not run).

Not tested by anyone: audio by ear, a real gamepad, pointer lock in a headed browser, Firefox or Safari, Low and Medium quality, nights 4 to 10 played honestly, the daily vigil, the drowned grove, and the true ending end to end.

## Fix these first

| # | Problem | Status |
| --- | --- | --- |
| 1 | Continue always loads at dawn with the day's haul kept, and Blooms regrow | reproduced |
| 2 | Offering or burying relics credits more than it removes | reproduced |
| 3 | The sky clock and health regeneration keep running while paused | reproduced |
| 4 | A Blood Moon is never recorded, so the true ending cannot be reached | reproduced (probe) |
| 5 | The Journal tutorial stalls if you do a step early | reproduced |
| 6 | The root cap fills in the first third of day 1 | reproduced |
| 7 | Bow towers beat every other build; upgrading always beats building | simulated |
| 8 | Bosses jam in a 2 m gap between walls and never attack | reproduced (probe) |
| 9 | Pack-up returns the whole item at full health, not 60% of materials | code |
| 10 | Hold E at the Heartwood spends every relic, including the golden idol | code |

## Bugs

### Critical

- **Continue rewinds the day.** `loadFrom` sets the clock to dawn and ignores the saved time (`src/core/Game.ts:1190`, `src/core/Save.js:44`).
  The critic saved with 80 s of day left and loaded with 260 s left, inventory intact.
  Quitting at night loads that morning, so a bad night can be replayed with a full day of preparation.
- **Blooms are not saved.** They re-sprout 2.5 s after every Continue (`Game.ts:892`).
  This farms favour, loot and two unlocks. It also hurts an honest player who clears the Blooms, quits, and comes back to find them open again at dusk.
- **Relic duplication.** With the same relic on the belt and in the pack, the offer credits all of them and removes only some (`Game.ts:2377-2389`, `src/items/Inventory.ts:176`).
  I reproduced it: 6 doubloons gave 270 favour and 3 doubloons stayed.
- **Blood Moon never registers.** `Waves.js:266` clears the sign before `Expedition.js:548` reads it.
  The idol never "answers the moon", so the true ending is unreachable, and every later sign night is a Blood Moon with double loot.

### Major

- **Pause does not pause the clock or healing.** In 4 s of pause the day advanced at full speed and health went from 20 to 36 (`Game.ts:3299`, `3123`).
  The satchel, the boon cards and story pages burn daylight the same way.
- **Tutorial steps only count while current** (`src/core/Journal.ts:119-143`). Place the starter tower early and "Place your Bow Tower" stays on screen with nothing to place.
  The Hunter kit has no tower and gets the same step.
- **Pack-up is a free repair and recharge** (`Game.ts:2440`). README, CHANGELOG and PLAN all say 60% of materials.
  Each re-placement also counts toward the build-100 achievement.
- **Bosses jam in passable gaps** (`src/defense/Enemies.ts:495`, `FlowField.js:117`). A Thornback stood in the gap for 27 s without attacking either wall while its summons took the Heart from 500 to 97.
- **Some cells near the camp benches are invisible to towers** (`src/defense/Towers.ts:651`). An egg there survived a bow tower at 16 m.
- **Trap health doubles as charges** (`Towers.ts:804`). One Spitter glob wipes most of a spike trap; Living Wood and Deep Roots refill it for free.
- **The Heartwood can revive from 0** if the last Blight dies on the same frame (`Waves.js:340`). Code only, not reproduced.
- **More state is lost on Continue:** foraged and cut plants, supply drops on the ground, dropped piles including your death pack, pending boon picks, and player health (code).
- **Offer, bury and seals take the idol and the Thornback's heart** with no confirmation (`Game.ts:2387`, `Expedition.js:308`).
- **Crafting a smaller pack while wearing a bigger one hides items** in slots that are no longer drawn (`Game.ts:1584`).
- **The daily vigil is not the same for everyone.** Only the world is seeded; Blooms, loot, elites and boons use unseeded randoms (`Game.ts:359`, `2403`).
- **Spitters can stall a night** against walls that regenerate (code, arithmetic only).

### Minor

- Holding E after an offering rolls straight into "Call the night early"; the same happens from repair into upgrade.
- A dead player can open the satchel, eat a poultice and craft.
- Esc does nothing while the plain satchel is open.
- Keys 1 to 8, I, F8 and F9 can be rebound onto with no warning, and both actions fire.
- "Take all" always shows R whatever the binding; it also does nothing, silently, while a search is still revealing items.
- Gamepad Start does not resume from pause.
- The crit chain counts missed swings and never triggers on a held button.
- Bloodroot heals on tower and burn kills, not only yours.
- Stones and firepots pass through trees and walls.
- Tip and glint timers count frames, so they run 2.4 times faster at 144 Hz.
- Pickups never despawn.
- The fourth radio part calls no supply drop, though the text says each one does.
- Journal goals: `night4` is never set; the graft goal appears after it is already met.
- "Thornbacks slain" on Records also counts the Rot Mother.
- "Reach night 15" needs night 15 held, not reached.
- The sign told at dawn can change by dusk if you pick up or drop the idol.
- A seal's last night does not stop the Rot spreading.
- The repo's own `e2e/blight.mjs` lantern check fails.
- `npm run typecheck` reports 58 errors, none a runtime bug in the files audited. `PostFX.js:358` reads a property that may not exist and is worth a look.
- The console repeats a shader warning (X3595, gradient in a loop) on every load.

## Balance and economy

**Measured numbers**

| Measure | Value |
| --- | --- |
| Day length | 270 s |
| Night length, nights 1 to 3 | 58 to 89 s by difficulty |
| Day 1 forage on Warden (bot) | 44 sticks, 29 stones, 15 logs, 12 vines, 19 feathers, 11 flint |
| Roots full on day 1 | 11 of 12 at 78 s on Warden |
| Walk, sprint | 4.3 and 7.4 m/s in code; sprint lasts about 8 s |
| Machete | 28 damage, hits three, every third swing 1.8 times |
| Blightling health | 48 |
| Bloom on day 1 | 170 health, 1 guard, cut in 10 s for an epic relic, a battery and 12 favour |
| Nearest points of interest | crates 66 m, scrap 124 m, ruins 154 m, camp 174 m, shrine 214 m, temple 390 m, wreck 541 m |

**Wave health against root cap (Warden)**

| Night | Enemies | Total health | Root cap |
| --- | --- | --- | --- |
| 1 | 9 | 432 | 12 |
| 3 | 16 | 1,755 | 16 |
| 5 | 29 | 6,127 | 20 |
| 7 | 45 | 9,828 | 24 |
| 10 | 66 | 18,547 | 30 |
| 11 | 71 | 16,210 | 32 |

Health grows 43 times by night 10 while the root cap grows 2.5 times. Night 11 is easier than night 10.

**Tower value at tier 1, 2, 3 (single-target damage per second per root)**

| Tower | Per root | Note |
| --- | --- | --- |
| Bow | 10 / 13.2 / 18.3 | tier 3 fires a second bolt |
| Brazier | 5.9 / 7.2 / 9.2 | 9 m range, 40% weaker in rain |
| Tesla | 4.7 / 6.6 / 9.5 | needs rare salvage; chains to 4 |
| Mortar | 3.75 / 5.3 / 7.6 | worth one for the slow |

**Findings**

- **Bow spam is the dominant strategy.** Six tier-3 bows on exactly the night-10 cap cleared the whole wave and the Rot Mother with no player input. The mixed presets at the same cap lost.
- **Upgrading always beats building**, because a tier costs one root and multiplies damage by 1.5 then 2.2.
- **Tesla and the vine snare are dead options.** Tesla costs the rarest parts for half a brazier's value. The snare wastes all six charges on a boss in about 8 s.
- **Tier 2 is gated by luck.** Workbench level 2 needs 3 rusty bolts and 2 rope; the Warden bot found 1 bolt in 12 searches over three days.
- **Nights 1 and 2 need no defence.** A bot with a machete and no towers held both. Night 3 is the first real check, because of the second Rotboar.
- **The Rotboar is the real threat, not the bosses.** It did nearly all the building damage in every lost run.
- **Both boss nights are rain nights**, which weakens braziers exactly when they matter.
- **Verdant takes no Heartwood damage for three nights. Blightborn night 3 is a wall** (lost with full roots, though the bot fights poorly).
- **Death is nearly free.** Respawn takes 5 s at full health; by day you walk back for the pack. Health also regenerates 4 a second after 6 s, which makes poultices marginal.
- **Offering beats burying early**, and the prompt gives no way to compare the two.
- **The slingshot is weak against Wisps**, the one enemy it is meant for: stones are blunt and Wisps halve blunt.

## Loop and pacing

- Nights are about a fifth of play time. A reviewer's first 11 minutes contain no threat.
- Days 3 to 6 add no new verbs. The Rot, grafts and new rifts all arrive at night 5 or later.
- There is no dawn recap. "You held through night 1" is the only reward beat; kills, damage taken and loot are never shown.
- On day 1 nothing shows where the Blight will walk. Trails appear only after the first night, so the first trap is a guess.
- The far sites (temple 390 m, wreck 541 m) cost most of a day for a round trip. That is a good decision in principle, but nothing tells the player the cost before they set off.
- Victory fires in the dark, the moment the last enemy dies.
- The Thornback takes over a minute to arrive and has no telegraph.

## Onboarding and interface

- Six text elements compete on the first frame: day banner, journal, Bloom alert, dusk timer, hint line, camp chip.
- The tutorial never teaches chopping trees for logs, the Coffer, weight, or the Bloom.
- The satchel shows all 20 recipes from the first minute, and "Pry Bar" appears twice with different costs.
- **HUD overlap, reproduced:** at 1024 px wide the journal covers the day banner, the dusk timer and the Heartwood bar. At 1366 px it still touches them. 1920 px and wider are clean.
- The "Discovered: Temple" banner draws over the day strip and the Heartwood bar.
- The victory card lets the journal and a live message show through its text.
- On death the held slingshot swings across the whole screen, and the camera sinks into the ground.
- The Field Guide clips at 1280×720.
- Settings lack a field-of-view slider, a fullscreen toggle, separate music and effects volume, and a HUD scale.
- The three difficulty cards have no accessible names.
- The boon picker takes keys 1 to 4 and can open 1.2 s after a Bloom dies, so a belt key-press can pick a boon by accident.
- The gamepad cannot drive the satchel.

## Retention

- **Run 2 offers little that is new.** The first Memory is the weak slingshot; kits unlock only after a win on Warden or harder.
- **Build variety is thin** because of the bow result above.
- **Nights differ only on sign nights** (4, 6 and 8).
- **Score ignores how well you held.** It counts nights, kills and bosses, not Heartwood health or deaths.
- **The true ending is fragile even once the Blood Moon bug is fixed:** a 390 m trek, a specific sign night, a second trek, and an idol that one key-hold can spend.
- `src/core/Story.js:12` marks the story text as placeholder. The endings are a single text card.

## Look, sound and performance

- Photographic ground sits beside faceted hero props: the glove, the flat machete, the Bloom, the lean-to. This mismatch, not the ground, is what keeps it from the target look.
- Forage props are oversized, and the camp ground is a near-black disc.
- The Rot reads as a tint, not a threat.
- All sound is synthesised and there is no music in play. Nobody judged it by ear.
- Performance is good: a sprint held 3.5 ms median frames with a 21 ms worst case. Night fights ran 42 to 76 frames a second in headless Chrome.
- The frame step is clamped to 0.05 s, so below 20 frames a second the game runs in slow motion.
- Apple GPUs are classed as integrated and start on Low or Medium.

## Text that disagrees with the code

| Text | Reality |
| --- | --- |
| Field Guide: a Blightling is "a single cut of the machete" | 28 damage against 48 health: two cuts |
| README: pack-up gives 60% of materials back | the whole item comes back |
| README: "every third hit in a row is a crit" | every third swing, misses included |
| Docs: Husks from day 3 | day 2 |
| Radio: each part calls a drop | the fourth does not |
| New-game note: "change nothing once the first night falls" | difficulty locks at Begin |
| Comment: Warden elites from night 4 | night 5 |
| Comment: the Rot slows towers 15% | up to 25% |
| Comment: each pack favours a different rift | the rift rotates every spawn |

## What works

- The title, menus, difficulty cards and intro card are clear and atmospheric.
- The satchel is readable and honest about what a recipe still needs.
- Foraging and cutting feel good: plants whip, loot pops, the journal advances.
- Night lighting, the rift beams and the lost-pack beacon read well.
- Prising a crate quietly or smashing it loudly is a real choice.
- No page errors appeared in any run, and the repo's 12-step story test passes.

## Suggested order of work

1. The relic duplication (one loop).
2. The save format: clock, Blooms, world state, pending boons, player health.
3. One pause gate for the clock, healing and pickups.
4. The Blood Moon record.
5. Journal steps credited from state.
6. Pack-up: decide between the 60% refund and carried health, then make the three docs agree.
7. Economy: forage density, root growth, tier root cost, and a night 1 with teeth.
8. Boss pathing through gaps, and the untargetable cells.
9. Interface: narrow-width HUD, relic pick list, boon picker lockout, settings gaps.
