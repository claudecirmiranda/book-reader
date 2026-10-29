# Leitor de EPUB (book.cafecomhomensdedeus.com.br)

PWA estático (epub.js + JSZip, copiados em `vendor/`). Não precisa de backend na VPS.

## Como funciona
- Biblioteca: `GET https://cafecomhomensdedeus.com.br/api/books.php` lista os `.epub` de `public_html/uploads/books/`.
- Livro: `GET .../api/books.php?file=<id>` entrega o `.epub` com CORS para `book.cafecomhomensdedeus.com.br`.
- Progresso, marcadores, destaques e ajustes ficam no `localStorage` do aparelho. Os livros abertos ficam na Cache API (leitura offline).

## Publicar
1. Hospedagem PHP: enviar `public_html/api/books.php` e os `.epub` para `public_html/uploads/books/`.
2. VPS: copiar o conteúdo desta pasta (sem este README) para o root do site, por exemplo `/var/www/book`.
3. DNS: registro `book` apontando para o IP da VPS. HTTPS é obrigatório (service worker e PWA).

Exemplo nginx:

```nginx
server {
  server_name book.cafecomhomensdedeus.com.br;
  root /var/www/book;
  index index.html;
  location = /sw.js { add_header Cache-Control "no-cache"; }
  location / { try_files $uri $uri/ =404; }
  # certbot --nginx -d book.cafecomhomensdedeus.com.br
}
```

## Novo livro
Basta enviar outro `.epub` para `uploads/books/`. Ele aparece na biblioteca sozinho.
O botão "Hoje" só aparece em livros cujo sumário tem itens no formato `001 · Título` (como o devocional).
