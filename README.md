# Leitor de EPUB (book.cafecomhomensdedeus.com.br)

PWA estático (epub.js + JSZip, copiados em `vendor/`). Não precisa de backend na VPS.

## Como funciona
- Biblioteca: `GET https://cafecomhomensdedeus.com.br/api/books.php` lista os `.epub` de `public_html/uploads/books/`.
- Livro: `GET .../api/books.php?file=<id>` entrega o `.epub` com CORS para `book.cafecomhomensdedeus.com.br`.
- Progresso, marcadores, destaques e ajustes ficam no `localStorage` do aparelho. Os livros abertos ficam na Cache API (leitura offline).

## Publicar
1. Hospedagem PHP: enviar `public_html/api/books.php` e os `.epub` para `public_html/uploads/books/`.
2. VPS (container): `git clone https://github.com/claudecirmiranda/book-reader.git && cd book-reader && docker compose up -d --build`.
   O container serve o site na porta 80 (publicada como 8080 no compose). Atualizar: `git pull && docker compose up -d --build`.
3. DNS: registro `book` apontando para o IP da VPS. O HTTPS (obrigatório para service worker e PWA) fica no proxy reverso que já recebe os domínios.

Sem Docker, qualquer servidor estático serve: o `nginx.conf` deste repositório mostra os cabeçalhos de cache necessários.

## Novo livro
Basta enviar outro `.epub` para `uploads/books/`. Ele aparece na biblioteca sozinho.
O botão "Hoje" só aparece em livros cujo sumário tem itens no formato `001 · Título` (como o devocional).
