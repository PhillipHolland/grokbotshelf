// The home page renders on demand: more groups (or flat-view cards) are added as you scroll toward the end. Tests that
// check every card scroll to the bottom the way a reader would until nothing more is added, then go back to the top.
module.exports = async function scrollAll(p) {
  await p.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let n = -1, same = 0;
    for (let i = 0; i < 200 && same < 3; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight); await wait(60);
      const m = document.querySelectorAll('#results .card').length;
      same = m === n ? same + 1 : 0; n = m;
    }
    window.scrollTo(0, 0); await wait(60);
  });
};
