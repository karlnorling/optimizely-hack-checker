import type { Results } from './analyze.ts';

export function Recommendations({ result }: { result: Results }) {
  const { overall, flags, findings } = result;
  const exposed = overall === 'high' || overall === 'possible' || overall === 'unknown';

  if (!exposed) {
    return (
      <section>
        <h2>What to do</h2>
        <div className="rec ok">
          <p>
            <strong>Nothing urgent.</strong> This history shows no visits to affected sites during the attack window.
          </p>
          <ul>
            <li>Check your other browsers, profiles and devices, especially phones and tablets.</li>
            <li>
              Private or incognito windows aren't recorded in history. If you used one on 16 November, use the
              checklist below anyway.
            </li>
            <li>Keep your iPhone and iPad up to date (iOS 18.7.3 or later, or 26.3 or later).</li>
          </ul>
        </div>
      </section>
    );
  }

  const loggedInSites = findings.filter((f) => f.risk !== 'none' && f.match.kind !== 'ioc').map((f) => f.host);

  return (
    <section>
      <h2>What to do</h2>

      {flags.ioc && (
        <div className="rec urgent">
          <h3>🚨 Your browser loaded attacker infrastructure directly</h3>
          <p>
            Your history includes a visit to a domain the attackers used for command-and-control or exploit delivery.
            This is a strong sign that the malicious script ran in your browser.
          </p>
          <ul>
            <li>Do every step below, starting with the ones for your device and wallets.</li>
            <li>If this history came from an iPhone or iPad (Safari with iCloud sync), treat that device as possibly compromised.</li>
          </ul>
        </div>
      )}

      {flags.unknownTimes && (
        <div className="rec">
          <h3>Some visit times are unknown</h3>
          <p>
            Pasted URLs have no timestamps. Load the browser's history file to get a time-based result, or assume the
            worst for the sites below if you may have used them on 16 November.
          </p>
        </div>
      )}

      <div className="rec">
        <h3>📱 iPhone and iPad</h3>
        <p>
          On iOS the script loaded the <em>Coruna</em> and <em>DarkSword</em> exploit kits in a hidden frame. Pages on iOS 18.6 or
          earlier reloaded every 60 seconds.
        </p>
        <ul>
          <li>
            Update now to <strong>iOS 18.7.3 or later</strong>, or <strong>26.3 or later</strong>. Older devices can use Apple's March 2026
            updates (iOS 15.8.7 and 16.7.15).
          </li>
          <li>If you visited these sites on an iPhone or iPad running older iOS, restart the device after updating.</li>
          <li>Change the passwords saved in your iCloud Keychain, starting with email, banking and crypto.</li>
          <li>If you're a high-risk user (journalist, activist, executive, crypto holder), consider turning on Lockdown Mode.</li>
        </ul>
      </div>

      {flags.crypto && (
        <div className={`rec ${flags.cryptoSite ? 'urgent' : ''}`}>
          <h3>🪙 Crypto transfers</h3>
          <p>
            The script swapped wallet addresses for the attacker's on eight chains: BTC, ETH/EVM, TRON, SOL, TON, LTC, BCH
            and DOGE. It did this on the page, in the clipboard, in form fields and in outgoing requests.
          </p>
          <ul>
            <li>
              Check every crypto transfer you made on 16 November. Compare the address in your wallet's history or on
              your hardware wallet's screen with the address you meant to send to, not with what you copied or pasted.
            </li>
            <li>
              If funds went to the wrong address, contact the exchange you sent from straight away and report it to the
              police or your national fraud centre (IC3 in the US, Action Fraud in the UK). Stolen funds were swept to
              exchanges within minutes.
            </li>
            <li>
              If you think your device itself was compromised (see iPhone and iPad), move your funds to a new wallet
              with a new seed phrase.
            </li>
            <li>From now on, always check the full address on your hardware wallet's screen before you confirm.</li>
          </ul>
        </div>
      )}

      <div className={`rec ${flags.cardSkimmer ? 'urgent' : ''}`}>
        <h3>💳 Payment cards</h3>
        {flags.cardSkimmer ? (
          <p>
            You visited an affected site after <strong>13:43 UTC</strong>, when a card skimmer was added. It captured the card
            number, expiry date and CVV from the site's own payment forms. Payment fields hosted in a separate frame
            (Stripe, Adyen and similar) were not readable.
          </p>
        ) : (
          <p>
            Your visits came before the card skimmer was added at 13:43 UTC, so the risk to card details is lower.
          </p>
        )}
        <ul>
          <li>If you entered card details on one of these sites on 16 November, call your bank and ask for a new card.</li>
          <li>Check your statements for unfamiliar charges, including small test payments, over the next few months.</li>
          <li>Turn on transaction alerts in your banking app.</li>
        </ul>
      </div>

      <div className="rec">
        <h3>🍪 Accounts and sessions</h3>
        <p>
          The script sent page screenshots and any cookies that JavaScript could read (non-HttpOnly cookies) to the
          attackers, together with the page URL.
        </p>
        <ul>
          <li>
            Sign out of every session on these sites and sign back in. Change your password if you were signed in
            during the window
            {loggedInSites.length > 0 && (
              <>
                : <span className="hosts">{loggedInSites.slice(0, 12).join(', ')}</span>
                {loggedInSites.length > 12 && ` and ${loggedInSites.length - 12} more`}
              </>
            )}
            .
          </li>
          <li>Turn on two-factor authentication, preferably with an authenticator app or passkey.</li>
          <li>
            Screenshots may have captured what was on screen, such as account numbers, balances or personal details. Be
            alert to targeted phishing that uses those details.
          </li>
        </ul>
      </div>

      <div className="rec">
        <h3>🧹 Your browser</h3>
        <ul>
          <li>
            The malware ran only inside the web page. On desktop, closing the tab stops it, and nothing stays on your
            computer.
          </li>
          <li>Clear your browser cache so a cached copy of the old script can't load again.</li>
          <li>Keep your browser and operating system up to date.</li>
        </ul>
      </div>
    </section>
  );
}
