// Tip card (X Money), "Buy us some Tokens", in the footer of every page. scripts/build.js puts it in the bot, creator and /add footers and
// between the <!-- tip:start --> / <!-- tip:end --> markers in index.html and 404.html. public/shelf-up.js wires the
// amount chips (copy only) and adds the floating Tokens button that opens the same card in a small panel.
// Honest by design: the X Money pay link opens a transfer to @Phil_Holland but cannot preset an amount, so the chips
// copy a number for the visitor to type in X and nothing says "Pay $N now". Every tip is split 50/50 with @thecsguy.
// The QR (desktop only) is public/tip-qr.svg, drawn by scripts/tip-qr.js; run that again if TIP_URL changes.
const TIP_URL = "https://x.com/i/money/pay/Phil_Holland";
const AMOUNTS = [3, 5, 10];
// Token: one coin with a four-point spark (the shelf's "Buy us some Tokens" ask; X Money itself is USD).
// Drawn for 18-20px: 2px ring, filled spark, so it reads on dark and light.
const CUP = `<svg class="tc-cup" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.25"/><path class="f" d="M12 6.6c.5 2.6 1.6 3.9 4.4 5.4-2.8 1.5-3.9 2.8-4.4 5.4-.5-2.6-1.6-3.9-4.4-5.4 2.8-1.5 3.9-2.8 4.4-5.4z"/></svg>`;
const XLOGO = `<svg class="tc-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
// v: the build's versioned() (content-hash ?v= for local files)
const tipCard = (v = (s) => s) => `<section class="tipcard" id="tip" aria-labelledby="tip-h">
  <div class="tc-main">
    <p class="tc-eye">${CUP}<span>Tip jar</span><span class="tc-via">via X Money</span></p>
    <h2 id="tip-h">Buy us some Tokens</h2>
    <div class="tc-who">
      <a class="tc-p" href="https://x.com/Phil_Holland" rel="noopener" target="_blank"><img src="${v("/avatars/phil_holland.webp")}" alt="" width="36" height="36" loading="lazy" decoding="async"><span><b>Phil</b><small>@Phil_Holland</small></span></a>
      <a class="tc-p" href="https://x.com/thecsguy" rel="noopener" target="_blank"><img src="${v("/avatars/thecsguy.webp")}" alt="" width="36" height="36" loading="lazy" decoding="async"><span><b>Nick</b><small>@thecsguy</small></span></a>
    </div>
    <p class="tc-split">Every tip is split 50/50 with @thecsguy.</p>
    <p class="tc-why">The shelf is free. If it saved you some digging, a few Tokens keep it going.</p>
    <div class="tc-amts" role="group" aria-label="Copy an amount in US dollars">${AMOUNTS.map((n) => `<button type="button" class="tc-amt" data-amt="${n}" aria-pressed="false">$${n}</button>`).join("")}</div>
    <p class="tc-hint" aria-live="polite">Tap an amount to copy it. You’ll type this in X: the pay link can’t fill in an amount.</p>
    <a class="tc-go" href="${TIP_URL}" rel="noopener" target="_blank">${XLOGO}<span>Buy us some Tokens</span></a>
    <p class="tc-fine">Opens X Money to send to @Phil_Holland.</p>
  </div>
  <figure class="tc-qr"><img src="${v("/tip-qr.svg")}" alt="QR code that opens X Money to tip @Phil_Holland" width="136" height="136" loading="lazy" decoding="async"><figcaption>Scan to tip from your phone</figcaption></figure>
</section>`;
module.exports = { TIP_URL, AMOUNTS, tipCard };
