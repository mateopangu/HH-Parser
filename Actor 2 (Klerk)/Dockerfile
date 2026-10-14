FROM apify/actor-node:20

# 1. Копируем описания зависимостей
COPY package*.json ./

# 2. Устанавливаем зависимости без автозапуска tsc
RUN npm install --include=dev --ignore-scripts

# 3. Копируем исходный код и tsconfig.json
COPY . ./

# 4. Компилируем TypeScript
RUN npm run build

# 5. Точка входа
CMD ["node", "dist/main.js"]