# Trilha de Engenharia de Dados

Plataforma de estudo interativa (SPA) para quem quer chegar ao nível **pleno** em
Engenharia de Dados e se preparar para entrevistas técnicas. A trilha parte da
pesquisa "o que as vagas mais pedem", cobre 13 capítulos dos fundamentos ao nível
pleno com exercícios corrigidos na hora e fecha com um simulado de processo
seletivo. Todo o conteúdo é ancorado no cenário fictício da empresa
**TechCommerce**.

- **13 capítulos · 60 sub-tópicos · ~1.300 exercícios** (múltipla escolha,
  completar, escrever código e comandos de terminal).
- Cada sub-tópico tem 4 níveis (**Fundamentos → Básico → Intermediário → Pleno**),
  um banner de contexto TechCommerce e um projeto final. Você só avança de nível
  ao acertar todas as questões do nível atual.
- **HTML/CSS/JS puro (ES5), sem framework e sem build step.** O conteúdo vive em
  `data/*.json` e é carregado via `fetch()`.

## Como rodar

O app carrega o conteúdo dinamicamente via `fetch()`, então **precisa ser servido
por um servidor HTTP local** — abrir `index.html` como `file://` não funciona
(CORS do navegador).

```bash
# a partir da pasta do projeto
python3 -m http.server 8000
# ou: npx serve .
```

Depois abra `http://localhost:8000/`.

> **Cache durante o desenvolvimento:** os `fetch()` de `data/*.json` usam
> `cache: 'no-store'`, então mudanças no conteúdo aparecem ao recarregar. Para
> mudanças em `css/app.css` ou `js/app.js`, use **Ctrl+Shift+R** ou deixe o
> DevTools aberto com **Network → "Disable cache"**.

## Estrutura do repositório

```
trilha-engenharia-dados/
├── index.html                       # markup do app + <link>/<script> para css/ e js/
├── css/app.css                      # todo o CSS
├── js/app.js                        # toda a lógica (roteamento por hash, render, correção, progresso)
├── data/
│   ├── chapters.json                # capítulos, grupos e sub-tópicos (o que aparece no menu / grid)
│   ├── topics-manifest.json         # lista [{id, file}] de todos os tópicos
│   └── topics/<capitulo>/<id>.json  # um arquivo = um tópico completo
├── build.js                         # gera a versão single-file em dist/
└── dist/trilha-engenharia-dados.html  # SAÍDA do build (não é fonte da verdade)
```

**Fonte da verdade = `data/`, `css/`, `js/`, `index.html`.** Nunca edite
`dist/*.html` diretamente — rode `node build.js` de novo para regenerá-lo.

### Páginas e navegação

Roteamento por `location.hash`:

| Hash | Página |
|---|---|
| `#/` (ou vazio) | Home — objetivo da trilha, "O que as vagas mais pedem" e CTA |
| `#/learning` | Aprendizado — grid dos 13 capítulos |
| `#/sobre` | Sobre — como a trilha foi construída |
| `#/capitulo/<cap>` | landing do capítulo (sub-tópicos + livro recomendado) |
| `#/capitulo/<cap>/<slug>` | página do sub-tópico (exercícios) |

O progresso é salvo em `localStorage` na chave `trilha-dados-quiz-v2`, por
tópico. Não há banco de dados nem login — cada navegador guarda o seu progresso.
As estatísticas da home são contadas direto do conteúdo em `data/`.

## Modelo de conteúdo

### Capítulos (`data/chapters.json`)

Cada chave é um capítulo, com `icon`, `eyebrow`, `title`, `intro`, uma lista de
`subtopics` (ou `groups`, quando há subdivisão, como `cloud` com GCP/AWS/Azure) e
um campo `book` (`{title, author, year, level, price, why, where}`), a leitura
recomendada mostrada no fim da página do capítulo.

Cada sub-tópico: `{ topicId, slug, sub }`. O `slug` entra na URL e precisa ser
único dentro do capítulo; `sub` é a frase curta mostrada no card.

**A ordem das chaves em `chapters.json` é a ordem recomendada de estudo** (cada
capítulo assume o anterior). É essa ordem que vira o rótulo "Etapa N de 13" nos
cards.

### Tópicos (`data/topics/<capitulo>/<id>.json`)

Um tópico tem `title`, `levels` e, opcionalmente, `project` e `finalProject`.

- **`levels`** — sempre 4, na ordem Fundamentos → Básico → Intermediário → Pleno.
  Cada nível tem `name`, `explain` (texto antes das questões), `links`
  (`[{label, url}]`, no máx. 4, com a tag do tipo entre colchetes no `label` —
  `[doc]`, `[livro]`, `[artigo]`, `[vídeo]`) e `questions`.
- **`project`** — banner de contexto TechCommerce no topo do quiz. Pode ter
  `title`, `description`, `note` e um destes: `tables`
  (`[{name, columns, rows}]`), `code` (`{label, content}`) ou `terminal`
  (`{shell, lines, output}`).
- **`finalProject`** — tarefa aberta liberada após os 4 níveis:
  `{ title, area, ask, task, deliverables[] }`.

### Tipos de questão

| type | campos-chave | como é corrigida |
|---|---|---|
| `mc` | `options` (4), `correct` (índice) | comparação exata do índice |
| `fill` | `accept` (respostas aceitas) | normalizado: minúsculas, sem acento, sem `().` |
| `code` | `requiredGroups` (grupos de keywords), `sample` | acerta se cada grupo tem ao menos 1 termo presente (case-insensitive) |
| `terminal` | como `code`, mais `shell` e `output` | idem `code`; mostra a saída simulada no feedback |

Toda questão tem um campo `explain`, mostrado após a correção.

## Como adicionar conteúdo

### Novo sub-tópico em capítulo existente

1. Crie `data/topics/<capitulo>/<novo-id>.json` (copie um vizinho como modelo).
2. Adicione `{ "id": "<novo-id>", "file": "<capitulo>/<novo-id>.json" }` em
   `data/topics-manifest.json`.
3. Adicione `{ "topicId": "<novo-id>", "slug": "<slug>", "sub": "..." }` na lista
   `subtopics` (ou no `groups[].subtopics` certo) do capítulo em
   `data/chapters.json`.
4. Suba o servidor local e confira o card novo no menu do capítulo.

### Capítulo novo

1. Crie `data/topics/<novo-capitulo>/` com os JSONs dos tópicos e registre todos
   no `topics-manifest.json`.
2. Adicione a chave do capítulo em `chapters.json` (com `subtopics` ou `groups`,
   e o campo `book`), na **posição pedagógica certa** — a ordem das chaves é a
   ordem de estudo.
3. Rode `node build.js` e confira o card novo em `#/learning`.

Depois de qualquer mudança em `data/`, `css/` ou `js/`, rode `node build.js` para
atualizar o single-file em `dist/`.

## Gerar o arquivo único (build.js)

```bash
node build.js                    # -> dist/trilha-engenharia-dados.html
node build.js caminho/custom.html
```

`build.js` (Node, só `fs`/`path`, zero dependências) lê `data/`, `css/app.css` e
`js/app.js`, inclui os dados inline no lugar dos `fetch()` e gera um HTML único e
autocontido — roda abrindo o arquivo direto, sem servidor. É a versão para
publicar como Artifact, colar num CMS ou enviar por e-mail.

## Testes

Não há suíte embutida no pacote. A validação usada é:

- Testes automatizados (jsdom) contra o single-file gerado por `build.js`,
  cobrindo todos os capítulos e o total de perguntas (o `sample` de cada questão
  `code`/`terminal` precisa passar na própria correção).
- Teste end-to-end (Playwright) servindo a pasta com `python3 -m http.server`,
  navegando pelo app, respondendo exercícios e conferindo a pontuação.

Ao editar conteúdo, o padrão é: subir o servidor local, abrir no navegador e
conferir que os tópicos alterados carregam e pontuam corretamente.
