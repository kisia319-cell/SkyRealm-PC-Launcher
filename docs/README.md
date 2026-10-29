# SkyRealm website

This folder contains the first mobile-friendly Russian landing page for SkyRealm.

## Publish from a phone with GitHub Pages
1. Open the repository: https://github.com/kisia319-cell/SkyRealm-PC-Launcher
2. Open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose branch **main** and folder **/docs**, then save.
5. Wait for GitHub Pages to publish and open the URL shown in Settings → Pages.

## Important: payments are intentionally disabled
The page shows the planned price of 199 RUB but does not accept money yet. Do not advertise sales as open until a payment provider approves the seller account and the server-side checkout/webhook and protected download delivery are implemented and tested. Never put payment-provider secret keys in this static website.

## Next implementation steps
- Choose a payment provider that can legally onboard the seller and accept Russian bank cards.
- Add a server-side order creation endpoint and verify payment notifications using the provider's signature.
- Store order/payment state server-side and issue expiring, unique download links only after verified payment.
- Upload the actual release archive to private storage; do not put the paid game file in a public repository.
- Add seller contact details, offer/terms, privacy policy, refund rules, and any required legal information before accepting orders.
