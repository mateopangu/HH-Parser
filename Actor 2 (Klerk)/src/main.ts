import { Actor } from 'apify';
import { CheerioCrawler, CheerioCrawlingContext } from '@crawlee/cheerio';

interface InputSchema {
    startUrls?: Array<string | { url: string }>;
}

await Actor.init();

const input = (await Actor.getInput<InputSchema>()) || {};
const startUrls = input.startUrls || [];

if (!startUrls.length) {
    console.log('Массив startUrls пуст. Завершение работы.');
    await Actor.exit();
}

// Нормализация ссылок
const requests = startUrls
    .map((item: string | { url: string }) => {
        let rawUrl = typeof item === 'string' ? item : item?.url;
        if (!rawUrl) return null;
        rawUrl = rawUrl.trim().replace(/^["']|["']$/g, '');
        return { url: rawUrl };
    })
    .filter((req): req is { url: string } => Boolean(req && req.url));

// Настройка резидентских (RESIDENTIAL) прокси с регионом RU
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    countryCode: 'RU',
});

const crawler = new CheerioCrawler({
    proxyConfiguration,

    maxConcurrency: 3,
    maxRequestsPerMinute: 60,
    navigationTimeoutSecs: 30,
    additionalMimeTypes: ['text/html'],

    preNavigationHooks: [
        async ({ request }) => {
            request.headers = {
                ...request.headers,
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept':
                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Cache-Control': 'no-cache',
            };
        },
    ],

    // УБРАЛИ enqueueLinks, чтобы актер не пытался никуда дальше кликать и ходил строго по списку
    async requestHandler({ $, request, log }: CheerioCrawlingContext) {
        log.info(`Обработка URL: ${request.url}`);

        const pageTitle = $('title').text().trim();
        if (pageTitle.includes('Капча') || pageTitle.includes('Доступ ограничен')) {
            log.warning(`HH.ru запросил капчу или ограничил доступ на URL: ${request.url}`);
            return;
        }

        // Обработка конкретной страницы вакансии
        const title =
            $('[data-qa="vacancy-title"]').text().trim() ||
            $('h1').text().trim();

        if (!title) {
            log.warning(`Не удалось извлечь заголовок вакансии на ${request.url}`);
            return;
        }

        const salary = $('[data-qa="vacancy-salary"]').text().trim() || 'Не указана';
        const company = $('[data-qa="vacancy-company-name"]').text().trim();
        const address =
            $('[data-qa="vacancy-view-raw-address"]').text().trim() ||
            $('[data-qa="vacancy-view-location"]').text().trim();
        const experience = $('[data-qa="vacancy-experience"]').text().trim();
        const employment = $('[data-qa="vacancy-view-employment-mode"]').text().trim();

        // Извлечение описания
        const descriptionNode = $('[data-qa="vacancy-description"], .g-user-content');
        descriptionNode.find('script, style, noscript').remove();
        const description = descriptionNode.text().replace(/\s+/g, ' ').trim();

        // Извлечение ключевых навыков
        const skills: string[] = [];
        $('[data-qa="bloko-tag__text"], [data-qa="skills-element"]').each((_, el) => {
            const skillText = $(el).text().trim();
            if (skillText && !skills.includes(skillText)) {
                skills.push(skillText);
            }
        });

        await Actor.pushData({
            url: request.url,
            title,
            company,
            salary,
            experience,
            employment,
            address,
            skills: skills.join(', '),
            description,
            scrapedAt: new Date().toISOString(),
        });
    },

    async failedRequestHandler({ request, log }: CheerioCrawlingContext) {
        log.error(`Не удалось обработать страницу: ${request.url}`);
    },
});

await crawler.run(requests);
await Actor.exit();