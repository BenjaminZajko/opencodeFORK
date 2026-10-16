# OliveCode: Cloudflare Pages + domény vo Websupporte

Aktuálna voľba používateľa (15. október 2026): **Cloudflare Pages Free**. Websupport účet obsahuje iba domény, nie hosting. Predchádzajúci postup pre platený Websupport hosting zostáva iba alternatívou. Domény sa neprevádzajú k inému registrátorovi a obnovujú sa ďalej vo Websupporte.

Hlavná doména: **https://olivecode.dev**. Druhá doména **olivecode.online** a oba názvy s `www` majú presmerovať na hlavnú adresu. Kontakt: **olivecode.ai@gmail.com**.

## 1. Účet a nahratie webu

Prihlás sa do svojho Cloudflare účtu alebo si vytvor účet a osobne potvrď podmienky. Použi **Free**; na tento statický web netreba platený plán, R2, Workers Functions, databázu ani nové Websupport služby. Bezplatný plán nie je prísľub nemenných podmienok navždy. Domény sa platia samostatne.

V časti **Workers & Pages** vytvor projekt **Pages → Direct Upload / Upload assets** (nie nový Worker s runtime kódom). Názov môže byť `olivecode`; ak je obsadený, použije sa dostupný názov. Zapíš skutočne pridelenú adresu `…pages.dev`, nevymýšľaj ju pred vytvorením projektu. Priamy upload nepotrebuje udeliť prístup k celému GitHub účtu alebo repozitáru.

Nahraj **distribution/cloudflare/OliveCode-olivecode.dev-web.zip**. V koreni ZIPu je index.html, verejné assety, _headers a _redirects. Nenahrávaj celý repozitár, inštalačné archívy aplikácie, .env, konfigurácie, tokeny, server, priečinok functions ani .htaccess. Projekt Direct Upload možno ďalej aktualizovať cez upload alebo Wrangler; zmenu na Git integration nemožno považovať za automatickú. [Oficiálny upload postup](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Najprv skontroluj web na pridelenom `pages.dev`. Tieto adresy majú zámerne hlavičku noindex; indexovanie patrí až hlavnej doméne. Chýbajúca stránka musí vracať vlastnú 404, nie domovskú stránku. Inštalačné odkazy sú obyčajný text a zostávajú vypnuté, kým nebude overené verejné vydanie aplikácie.

## 2. Pripojenie domén

Pridaj **olivecode.dev** aj **olivecode.online** ako samostatné domény (zóny) na Cloudflare Free. Pred zmenou nameserverov exportuj alebo zaznamenaj existujúce DNS vo Websupporte a porovnaj ho s importom Cloudflare. Zachovaj potrebné MX, TXT, overovacie a ostatné používané záznamy. Nepredpokladaj, že automatický import zachytil všetko.

Cloudflare pridelí konkrétnu dvojicu nameserverov. **Vo Websupporte nastav iba tieto skutočne pridelené hodnoty**, po kontrole záznamov a potvrdení zmeny používateľom. Nameservery menia správu celého DNS, nie vlastníctvo domény. Ak je zapnutý DNSSEC/DS, migráciu vykonaj podľa aktuálneho návodu poskytovateľov; starý DS nesmie zostať smerovať na neplatné podpisy. Nepredpokladaj stav DNSSEC bez overenia. Po úspešnom prechode obnov zabezpečenie pre novú DNS správu.

Na koreňovú doménu Pages vyžaduje Cloudflare nameservery; samotný CNAME vo Websupporte nestačí pre túto konfiguráciu. Pri samostatnej subdoméne sú možnosti iné. [Vlastné domény Pages](https://developers.cloudflare.com/pages/configuration/custom-domains/).

V projekte Pages otvor **Custom domains** a pripoj `olivecode.dev`. Až cez tento postup vytvor potrebný DNS záznam; samotné ručné nasmerovanie bez pripojenia v Pages môže viesť k chybe. Pred vyhlásením webu za spustený musia byť doména aj HTTPS certifikát aktívne.

Pre presmerované názvy vytvor proxied DNS záznamy podľa aktuálneho návodu Cloudflare pre alias bez origin servera. Nenahrávaj do DNS náhodné IP adresy. Alternatívne možno tieto názvy tiež pripojiť v Custom domains a potom uplatniť Redirect Rules pred odpoveďou Pages. [Doména slúžiaca iba na presmerovanie](https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/).

## 3. Presmerovania a HTTPS

**Doménové presmerovania nepatria do Pages súboru _redirects.** Ten slúži iba na cesty ako `/guide.html → /guide`. V Cloudflare zóne nastav **Rules → Redirect Rules → Single Redirect**. Pripravené presné definície sú v `site/cloudflare-zone-rules.json`; neobsahujú tajné údaje a samy sa nikam neposielajú.

Pre zónu **olivecode.dev**:

- Filter: `(http.host eq "www.olivecode.dev") or (http.host eq "olivecode.dev" and http.request.scheme eq "http")`
- Typ cieľa: Dynamic.
- Výraz: `concat("https://olivecode.dev", http.request.uri.path)`
- Status: **301**.
- **Preserve query string: zapnuté**.

Pre zónu **olivecode.online**:

- Filter: `http.host in {"olivecode.online" "www.olivecode.online"}`.
- Rovnaký dynamický cieľ, status 301 a zachovanie query string.

Presmerované názvy potrebujú funkčné DNS a HTTPS certifikáty tiež. Nevypínaj overovanie certifikátov a nepoužívaj Flexible ako spôsob maskovania problémov. Nastavenia bezpečnosti neoslabuj. [Single Redirect príklad](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-different-hostname/), [vytvorenie pravidla](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/).

## 4. Zostavenie a aktualizácie

Z koreňa repozitára:

```sh
rtk bun install --cwd site --frozen-lockfile
cd site
rtk bun test ./install.test.ts ./launch.test.ts
cd ..
rtk env OLIVECODE_SITE_ENV=production bun site/prepare.ts
rtk bun site/check-launch.ts
rtk bun site/package.ts
```

Predvolený host je Cloudflare Pages. Výsledkom je 41 verejných súborov a ZIP v distribution/cloudflare. Kontrola odmieta súbory backendu, neočakávané zdroje a príliš veľké assety. Limity Cloudflare Free sú aktuálne 20 000 súborov a 25 MiB na súbor, čo náš web s veľkosťou približne 2 MB pohodlne spĺňa. Aplikácia samotná sa poskytuje cez GitHub Releases. [Limity](https://developers.cloudflare.com/pages/platform/limits/).

Predvolené lokálne buildy sú noindex; na verejnú hlavnú doménu použi produkčný build. `_headers` nastavuje bezpečnostné hlavičky, povolenie vlastného JSON-LD cez CSP hash, no-cache pre meniace sa HTML/config a no-store + text/plain pre install. Cesty a vlastnú 404 obsluhuje Pages. [Hlavičky](https://developers.cloudflare.com/pages/configuration/headers/), [obsluha stránok](https://developers.cloudflare.com/pages/configuration/serving-pages/).

Manuálny workflow **OliveCode Cloudflare website bundle** pripraví ZIP ako artefakt. Nedáva mu tým oprávnenie meniť DNS alebo automaticky publikovať. Po prihlásení možno pre ďalšie aktualizácie použiť oficiálny Wrangler, prípadne znovu nahrať ZIP; nikdy nedávaj do repozitára API token.

## 5. Verejné vydanie aplikácie a finálna kontrola

Web a vydanie aplikácie sú oddelené kroky. Aktuálne web zostáva so sťahovaním vypnutým. Použi pripravený natívny release workflow, over verejné prílohy a výsledky a až potom zostav release-enabled web z matching zdrojov:

```sh
rtk bun distribution/verify-release.ts --output /tmp/olivecode-release.json
rtk env OLIVECODE_SITE_ENV=production OLIVECODE_RELEASE_READY=true OLIVECODE_RELEASE_VERIFICATION=/tmp/olivecode-release.json bun site/prepare.ts
rtk bun site/check-launch.ts
rtk bun site/package.ts
```

Doklad musí byť mladší než 24 hodín; lokálne install skripty sa musia zhodovať s verejným vydaním. Testy štartu v CI nenahrádzajú interaktívne Windows/Linux testy alebo podpisovanie. Verejné príkazy `curl -fsSL https://olivecode.dev/install | sh` a `irm https://olivecode.dev/install.ps1 | iex` nepropaguj ako funkčné, kým inštalácia neprešla z reálnych verejných adries.

Po zapnutí domén spusti `rtk bun site/check-deployment.ts`. Kontrola nič nemení ani nespúšťa inštalátory. Overí HTTPS, aliasy, zachovanie cesty/query, stránky, bezpečnostné hlavičky, reálnu 404, install typy, sitemap, robots, share obrázok a build-info. Potom otestuj Safari, mobil a čistú inštaláciu aplikácie.

Ak sa objaví problém, v Pages vyber predchádzajúce overené nasadenie a vykonaj rollback. DNS záznamy obnovuj iba zo skutočnej zálohy, nie odhadom. SSL chyby neopravuj vypnutím overovania. Zachovaj registračné obnovovanie domén vo Websupporte.

Verejná Privacy už uvádza Cloudflare ako hosting a Gmail kontakt; Websupport ostáva registrátorom. Analytika, reklamné trackery, platené Functions ani sponzorské meranie sa týmto nezapínajú. Vlastník ešte musí potvrdiť právnu identitu a primerané údaje prevádzkovateľa; obchodné meno ani adresu sme nevymýšľali. Zachovaj upstream licencie. Doménový nákup ani hosting nie sú zárukou neobmedzenej dostupnosti cloudových AI modelov.
