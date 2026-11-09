// Sample ref reports used by the tests (not real games).
const game = (date, number, home, away, venue, time = "21:00") => ({ date, time, number, venue, home, away, officials: ["Mike Laing", "Gavin Laing", "Mike Lynch"] });
const side = (scorers = [], keepers = [{ name: "Keeper", minutes: "90" }], cards = []) => ({ scorers, keepers, cards });
const Y = (name, infraction = "Unsporting behaviour", description = "") => ({ name, card: "Yellow", infraction, description });
const R = (name, infraction = "Serious foul play", description = "") => ({ name, card: "Red", infraction, description });
const q = { ball: "Home team", flags: "Home team", listHome: "Yes", listAway: "Yes", cards: "Yes" };
const rec = (submittedAt, g, hs, as, home, away, extra = {}) => ({ submittedAt, refName: "Billy Cheng", refEmail: "billy@example.com",
  report: { homeScore: hs, awayScore: as, home, away, field: extra.field || "", notes: extra.notes || "", questions: q, game: g }, photos: extra.photos || [] });
module.exports = [
  // 1. Plain game, one yellow each side
  rec("2026-11-01T19:10:00Z", game("2026-11-01", "d1-8-30", "AC Richmond", "Unicorn FC", "Hugh Boyd - Red", "11:00"), 3, 1,
    side([{ name: "Rylan Sangha", jersey: "9" }, { name: "rylan sangha", jersey: "9" }, { name: "Juan Carlos Marquez Santander", jersey: "" }], undefined, [Y("Rylan Sangha", "Dissent by word or action")]),
    side([{ name: "Tom Lee", jersey: "7" }], undefined, [Y("Tom Lee")]),
    { field: "Wet but playable.\nCorner flags missing on the north side.", photos: [{ name: "home-team-list-1.jpg", url: "https://example.sharepoint.com/photo1.jpg" }, { name: "away-team-list-1.jpg", url: "https://example.sharepoint.com/photo2.jpg" }] }),
  // 2. Two yellows in one game for Tom Lee (recorded as two yellow rows) -> 1 red, 0 yellows from this game
  rec("2026-11-06T06:30:00Z", game("2026-11-05", "d1-9-33", "Unicorn FC", "RFC Hibs", "Minoru Oval"), 0, 2,
    side([], undefined, [Y("Tom Lee", "Persistent infringement"), Y("tom lee", "Unsporting behaviour", "Second yellow for kicking ball away")]),
    side([{ name: "Ali Ahmed", jersey: "10" }, { name: "Ali Ahmed", jersey: "10" }])),
  // 3. Yellow then Red "second caution" for Rylan Sangha -> counts as 1 red only; plus a straight red for another player
  rec("2026-11-08T21:00:00Z", game("2026-11-08", "d1-10-37", "RFC Hibs", "AC Richmond", "Hugh Boyd - Blue", "13:00"), 1, 1,
    side([{ name: "Ali Ahmed", jersey: "10" }], undefined, [R("Sam Webster", "Violent conduct", "Punched opponent after a tackle.")]),
    side([{ name: "Rylan Sangha", jersey: "9" }], undefined, [Y("Rylan Sangha"), R("Rylan Sangha", "Receiving a second caution in the same match")])),
  // 4. Correction of report 3 sent later: Webster red changed to a yellow -> only this version counts
  rec("2026-11-08T23:30:00Z", game("2026-11-08", "d1-10-37", "RFC Hibs", "AC Richmond", "Hugh Boyd - Blue", "13:00"), 1, 1,
    side([{ name: "Ali Ahmed", jersey: "10" }], undefined, [Y("Sam Webster", "Unsporting behaviour")]),
    side([{ name: "Rylan Sangha", jersey: "9" }], undefined, [Y("Rylan Sangha"), R("Rylan Sangha", "Receiving a second caution in the same match")]),
    { notes: "Corrected report: Webster was a yellow, not a red." }),
  // 5. Masters game, no cards
  rec("2026-10-30T05:00:00Z", game("2026-10-29", "m-7-14", "Richmond Old Blacks", "Rain City Gunners", "King George"), 2, 2, side(), side())
];
