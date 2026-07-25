FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-alpine AS backend
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend

FROM node:22-alpine
WORKDIR /app
COPY --from=frontend /app/dist ./dist
COPY --from=backend /usr/local /usr/local
COPY --from=backend /app/backend ./backend
RUN npm install -g serve@14
EXPOSE 3000 5000
CMD sh -c "python backend/app.py & serve -s dist -l 3000"

