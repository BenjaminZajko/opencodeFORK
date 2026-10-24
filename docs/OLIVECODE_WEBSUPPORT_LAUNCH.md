# OliveCode: nasadenie na Websupport (alternatíva)

**Aktualizácia:** účet obsahuje iba domény, nie hosting. Používateľ zvolil Cloudflare Pages Free. Aktuálny postup je [OLIVECODE_CLOUDFLARE_LAUNCH.md](OLIVECODE_CLOUDFLARE_LAUNCH.md). Tento dokument sa vzťahuje len na prípadný neskorší nákup Websupport hostingu; nie je potvrdením, že ho používateľ má. Pri zostavení tejto alternatívy nastav `OLIVECODE_SITE_HOST=Websupport`.

Stav prípravy: 15. október 2026. Hlavná doména **olivecode.dev**, druhá doména **olivecode.online**, verejný kontakt **olivecode.ai@gmail.com**. Obe domény aj hosting už patria používateľovi. Názvy serverov domén sú aktuálne Websupport; netreba ich presúvať na Cloudflare. Tento postup nemení DNS, účet ani súbory na hostingu automaticky.

## Čo nahrať

Hotový balík: `distribution/websupport/OliveCode-olivecode.dev-web.zip`.

Obsah ZIPu patrí priamo do koreňového adresára webu. Nesmie vzniknúť ďalší vnorený priečinok `site-dist`. V archíve je aj skrytý súbor **.htaccess**: bez neho nebudú fungovať presmerovania, čisté adresy ani bezpečnostné hlavičky.

Do hostingu nepatrí celý repozitár, `.env`, konfigurácie poskytovateľov, Telegram/WhatsApp tokeny, databázy ani aplikácia spustená na tvojom Macu. Web je statický. Verejné archívy aplikácie budú uložené v GitHub Releases, nie v tomto ZIPe. Telegram listener, WhatsApp webhook a prípadná budúca služba na meranie sponzorov sú samostatné služby; zdieľaný webhosting ich týmto uploadom nespúšťa.

## 1. Nastavenie domén a HTTPS

Vo WebAdmine priraď **olivecode.dev** k existujúcemu hostingu. Skontroluj skutočný koreňový adresár zobrazený administráciou; typicky ide o `olivecode.dev/web`. Najprv si stiahni zálohu jeho aktuálneho obsahu. [Priradenie domény](https://www.websupport.sk/podpora/kb/priradenie-domeny-na-hosting/), [koreňový adresár](https://www.websupport.sk/podpora/kb/korenovy-adresar/).

Odporúčané: nastav **olivecode.online** ako hostingový alias smerujúci na rovnaký web. Rovnako zabezpeč, aby oba názvy s `www` smerovali na tento hosting a boli obsluhované. Pripravené pravidlá pošlú všetky tri alternatívne názvy na `https://olivecode.dev`, pričom zachovajú cestu aj parametre. Napríklad `https://olivecode.online/guide?lang=sk` prejde na `https://olivecode.dev/guide?lang=sk`. [Hostingové aliasy](https://www.websupport.sk/podpora/kb/hostingove-aliasy/).

**Ešte pred zapnutím presmerovaní aktivuj a over platné SSL certifikáty pre všetky štyri názvy:** `olivecode.dev`, `www.olivecode.dev`, `olivecode.online`, `www.olivecode.online`. Websupport poskytuje Let's Encrypt; skontroluj stav a automatické obnovovanie vo WebAdmine. Certifikát potrebuje aj doména, ktorá iba presmerováva: HTTPS spojenie vzniká pred presmerovaním. Doména `.dev` vyžaduje funkčné HTTPS už pri prvom otvorení v bežnom prehliadači ([Google Registry](https://www.registry.google/domains/dev/)). Neobchádzaj chybu certifikátu. [SSL vo Websupporte](https://www.websupport.sk/podpora/kb/lets-encrypt/).

Ak Websupport musí mať pre `.online` samostatný koreňový adresár, použi v ňom obsah `OliveCode-olivecode.online-redirect.zip`. Tento malý balík obsahuje iba presmerovanie na hlavnú doménu; **nenahrávaj ho do koreňa olivecode.dev**. Certifikáty a `www` treba overiť aj pri tejto možnosti.

Keďže zostávame na Websupporte, nemeň nameservery bez dôvodu. Zachovaj existujúce MX/TXT a overovacie záznamy. Verejný Gmail kontakt sám osebe nevyžaduje vytváranie firemných poštových záznamov. Ak neskôr začneš odosielať z adresy `@olivecode.dev`, nastav overenie pošty podľa skutočného poskytovateľa.

## 2. Nahratie webu

Použi správcu súborov Websupportu alebo podporované zabezpečené pripojenie a prihlasovacie údaje zo svojho účtu. Heslá ani tokeny nevkladaj do tohto dokumentu, kódu alebo chatu.

1. Zálohuj aktuálny web a prípadné vlastné pravidlá `.htaccess`.
2. Rozbaľ hlavný ZIP a nahraj **jeho obsah** do koreňového adresára hlavnej domény vrátane skrytých súborov. Existujúce pravidlá nemiešaj naslepo s novými.
3. Pri aktualizácii nahraj najprv assety a skripty, potom HTML a nakoniec novú konfiguráciu. Zmena sa neprejaví ako nový web, pokiaľ ostane starý `index.html` alebo sa obsah nahrá o priečinok hlbšie.
4. Otvor hlavnú adresu v Safari aj inom prehliadači, otestuj mobil a klikni na Guide, Privacy, Terms, Contact. Vyskúšaj ľubovoľnú neexistujúcu adresu: má sa zobraziť vlastná chyba 404.
5. Spusť nižšie uvedenú verejnú kontrolu. Ak dostaneš chybu 500, over nahratie `.htaccess` a error log hostingu; nesnaž sa ju maskovať prepísaním všetkých adries na úvodnú stránku.

Websupport podporuje presmerovania, vlastné chybové stránky a ďalšie použité pravidlá cez [.htaccess](https://www.websupport.sk/podpora/kb/htaccess/). Reálne nastavenie účtu však musí potvrdiť kontrola po nahratí.

## 3. Inštalácia aplikácie: samostatná podmienka spustenia

**Webový balík je pripravený so sťahovaním vypnutým. Verejné vydanie aplikácie zatiaľ nebolo dostupné; overovač vrátil 404.** To nie je chyba webu. Kopírovanie inštalačného príkazu je vypnuté a oba install endpointy vracajú zrozumiteľný text, ktorý skončí bez inštalácie. Nákup domény automaticky nevytvorí vydanie aplikácie.

Na zverejnenie aplikácie je pripravený manuálny GitHub Actions workflow **OliveCode preview packages**. Pred spustením skontroluj zmeny v zdrojovom kóde a nahraj iba to, čo chceš mať verejne. Lokálny pracovný priečinok obsahuje aj dlhšiu históriu rozpracovaných zmien; nepridávaj celý obsah počítača ani prihlasovacie údaje.

Workflow s vypnutým `publish` iba vytvorí testovacie artefakty. S `publish` zapnutým zverejní vydanie až po úspechu všetkých ôsmich cieľov: macOS Intel/Apple Silicon, Windows x64/ARM64 a Linux x64/ARM64 vo variantoch glibc/musl. Overenie zahŕňa inštaláciu a štart binárky; **nenahrádza reálny interaktívny test Windows/Linux**, pripojenie účtu, Ollama a prácu v novom projekte. Natívne ovládanie Mac aplikácií nie je funkcia Windows. Podpisovanie/notarizácia macOS a podpis Windows zostávajú súčasťou dôveryhodnej verejnej distribúcie; netvrdíme, že sú hotové.

Po publikovaní vydania z príslušnej verzie zdrojov:

```sh
rtk bun distribution/verify-release.ts --output /tmp/olivecode-release.json
rtk env OLIVECODE_SITE_ENV=production OLIVECODE_RELEASE_READY=true OLIVECODE_RELEASE_VERIFICATION=/tmp/olivecode-release.json bun site/prepare.ts
rtk bun site/check-launch.ts
rtk bun site/package.ts
```

Overovač kontroluje verejné prílohy, repozitár, commit, úspešný natívny workflow a zhodu inštalačných skriptov. Doklad musí byť pri zostavení mladší než 24 hodín. Samotné prepnutie premennej na `true` nestačí. Kontrolné súčty chránia prenos; nie sú náhradou digitálneho podpisu. Ak overenie zlyhá, nechaj kopírovanie vypnuté a vyrieš príčinu.

Až po tomto kroku sú určené na propagáciu tieto príkazy:

macOS a podporovaný Linux:
```sh
curl -fsSL https://olivecode.dev/install | sh
```
Windows PowerShell:
```powershell
irm https://olivecode.dev/install.ps1 | iex
```

Po inštalácii otvor používateľov projektový priečinok a spusti `olivecode`; existujúci launcher zachová jeho aktuálny priečinok. Neskúšaj univerzálne sľuby pre 32-bit PC, mobilné terminály alebo každý starý operačný systém.

## 4. Overenie a obnova

Z koreňa repozitára po nahratí:

```sh
rtk bun site/check-deployment.ts
```

Kontrola nič nemení a nespúšťa stiahnuté inštalátory. Overí HTTPS, tri aliasy, zachovanie parametrov, kanonické adresy, hlavičky, správnu 404, typ install súborov, obrázok zdieľania, robots, sitemap a stav nasadeného balíka. Certifikáty musia prejsť bežným overením. Pri chybe oprav reálne nastavenie, nie test.

Lokálna príprava nového balíka bez verejného vydania:

```sh
rtk bun install --cwd site --frozen-lockfile
cd site
rtk bun test ./install.test.ts ./launch.test.ts
cd ..
rtk env OLIVECODE_SITE_ENV=production bun site/prepare.ts
rtk bun site/check-launch.ts
rtk bun site/package.ts
```

Na macOS možno overiť konfiguráciu aj pomocou `rtk python3 site/check-websupport.py`; spustí iba vlastný dočasný Apache s testovacím certifikátom. Lokálny náhľad: `rtk python3 site/preview.py` a `http://127.0.0.1:8765/`. Browser testy: `site/run-browser-checks.cjs` s nainštalovaným Playwrightom. Lokálne výsledky nenahrádzajú verejnú kontrolu hostingu.

Pri probléme obnov celý predchádzajúci overený balík zo zálohy. Zdrojový web neodstraňuj pred zálohou. Verzie assetov v URL znižujú miešanie starých a nových súborov; pri testovaní si stále over, že načítavaš správnu doménu, nie starý lokálny náhľad. Expiráciu `/.well-known/security.txt` obnov pri každom zostavení; aktuálne je nastavená na 180 dní.

## 5. Pred oznámením verejnosti

- Over podporu cez **olivecode.ai@gmail.com** a nastav si dvojfaktorové zabezpečenie Gmailu, Websupportu a GitHubu.
- Vlastník musí potvrdiť presnú právnu identitu prevádzkovateľa, vhodné údaje pre Privacy/Terms a skutočné nastavenie uchovávania hostingových logov. E-mail je už verejný; nevymýšľali sme obchodné meno, sídlo ani lehoty. Pri komerčnom spustení daj skontrolovať relevantné právne povinnosti.
- Stránka používa iba lokálne assety, bez reklamných trackerov a analytiky. Sponzorstvo zostáva v aplikácii. Meranie zobrazení nie je týmto nasadením zapnuté a sponzorom nesľubuj neexistujúce čísla.
- Zachovaj licenciu upstream OpenCode a licencie tretích strán v distribúcii. Vlastná značka neoprávňuje odstrániť povinné licenčné oznámenia.
- Ceny konkurencie boli overené na oficiálnych stránkach 15. októbra 2026. Porovnanie je ročný prepočet mesačných plánov, nie meranie výkonu. Pravidelne ho obnovuj. Cloud poskytovatelia majú limity; automatické prepínanie negarantuje nekonečnú dostupnosť. Lokálne modely vyžadujú hardvér a nastavenie.
- V Google Search Console over hlavnú doménu svojím účtom a odošli `https://olivecode.dev/sitemap.xml`. Web používa jednu kanonickú doménu a produkčný build povoľuje indexovanie; lokálne preview je noindex. [Kanonické adresy](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
- Vyskúšaj nový účet a čistú inštaláciu, nie iba už prihlásený vývojový Mac. Natoč skutočné demo a pozvi menšiu beta skupinu skôr, než začneš platiť za marketing.

## Stav odovzdania

| Oblasť | Stav |
| --- | --- |
| Domény a kontakt v zdrojoch | Pripravené |
| Verejný statický ZIP a oddelený alias ZIP | Generované príkazom `site/package.ts` |
| Presmerovania, HTTPS pravidlá a hlavičky | Lokálne overené na Apache |
| Navigácia, kopírovanie, jazyky a animácie | Overujú browser testy |
| Upload do Websupportu, certifikáty účtu a verejná kontrola | Vyžadujú reálne nasadenie |
| Verejné vydanie aplikácie a funkčný verejný install | Zatiaľ nezverejnené; kopírovanie je blokované |
| Windows/Linux interaktívne testy a podpisovanie | Nepotvrdené |
| Verejná analytika a sponzorské meranie | Nezapnuté |

Pripravený manuálny workflow **OliveCode Websupport website bundle** vytvára rovnaký upload balík v GitHub Actions. Neprihlasuje sa do Websupportu ani nič nezverejňuje automaticky.
