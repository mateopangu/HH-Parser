import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

await Actor.init();

interface Input {
    keyword?: string;
    maxPages?: number;
}

const input = (await Actor.getInput<Input>()) || {};
const keyword = input.keyword || 'n8n';
const maxPages = Number(input.maxPages) || 50;

const encodedKeyword = encodeURIComponent(keyword);

// Генерируем массив всех нужных страниц прямо на старте
const startUrls: string[] = [];
for (let page = 0; page < maxPages; page++) {
    startUrls.push(`https://hh.ru/search/vacancy?text=${encodedKeyword}&page=${page}`);
}

const crawler = new CheerioCrawler({
    // Ограничиваем параллельность, чтобы не срабатывал антифрод HH
    maxConcurrency: 2,

    proxyConfiguration: await Actor.createProxyConfiguration({
        groups: ['RESIDENTIAL'],
        countryCode: 'RU',
    }),

    async requestHandler({ $, request, log }) {
        log.info(`Парсим страницу: ${request.url}`);
        const vacancies: Array<{ title: string; url: string; description: string; scrapedAt: string }> = [];

        $('.vacancy-card--serp, [data-qa="vacancy-serp__vacancy"]').each((_, el) => {
            const titleEl = $(el).find('a[href*="/vacancy/"]').first();
            const title = titleEl.text().trim();
            const rawUrl = titleEl.attr('href');

            if (!title || !rawUrl) return;

            const cleanUrl = rawUrl.split('?')[0];
            const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://hh.ru${cleanUrl}`;
            const snippet = $(el).find('[data-qa*="snippet"]').text().trim() || 'Описание отсутствует';

            vacancies.push({
                title,
                url: fullUrl,
                description: snippet,
                scrapedAt: new Date().toISOString(),
            });
        });

        if (vacancies.length > 0) {
            await Dataset.pushData(vacancies);
            log.info(`Сохранено ${vacancies.length} вакансий со страницы: ${request.url}`);
        } else {
            log.warning(`Вакансии на странице не найдены: ${request.url}`);
        }
    },
});

// Запускаем обход всех сформированных страниц
await crawler.run(startUrls);
await Actor.exit();