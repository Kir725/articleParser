let Core, Commands, ArticleParser, Tools, GUI;

/*
 TODO:
 - Придумать, как экранировать символы * и _, чтобы при этом не ломались ссылки?
   - Экранировать всё, найти все ссылки ( http, https, // ), разэкранировать их?
*/

Core = {
  init() {
    GUI = Tools.getJsTree();
    Core.appendListeners();
  },

  /* ------------------------------------------------------------------------------------------- */
  appendListeners() {
    let processBtn = (name, func) => {
      GUI.buttons[name].addEventListener('click', func || Commands[name]);
    };

    processBtn('HTMLtoMarkdown');
    processBtn('exportForGDocs');
    processBtn('markdownToHTML');
    processBtn('downloadAsText');
    processBtn('findAndReplace_preview', () => { Commands.findAndReplace(true); });
    processBtn('findAndReplace_process', () => { Commands.findAndReplace(false); });

    GUI.zipSelect.addEventListener('change', Commands.importFromGDocs);
    GUI.textFileSelect.addEventListener('change', Commands.openTextFile);
  },
};

/* ============================================================================================= */
/* ============================================================================================= */
/* ============================================================================================= */

Commands = {
  HTMLtoMarkdown() {
    // https://github.com/domchristie/to-markdown
    let str = GUI.field.value;
    str = ArticleParser.cleanTags(str);
    str = ArticleParser.prepareHTMLforMarkdown(str);
    str = ArticleParser.HTMLtoMarkdown(str);
    str = ArticleParser.fixMarkdown(str);
    str = ArticleParser.tidyMarkdownLinks(str);
    GUI.field.value = str;
  },

  /* ------------------ */
  exportForGDocs() {
    let
      str   = GUI.field.value,
      title = ArticleParser.generateBrief(str) || 'Google Docs Table';

    str = ArticleParser.convertIntoTable(str);
    ArticleParser.downloadAsFile(str, `${title}.html`);
  },

  /* ------------------ */
  importFromGDocs({target: input}) {
    if (!input.files.length) return;
    ArticleParser.readZip(input.files[0], GUI.field);
  },

  /* ------------------ */
  openTextFile({target: input}) {
    if (!input.files.length) return;
    ArticleParser.readTextFile(input.files[0], GUI.field);
  },

  /* ------------------ */
  markdownToHTML() {
    // https://github.com/showdownjs/showdown
    let
      str = GUI.field.value,
      converter = new showdown.Converter({
        noHeaderId:    true,
        strikethrough: true,
        tables:        true,
      });

    str = converter.makeHtml(str);
    str = ArticleParser.fixHTML(str);
    GUI.field.value = str;
  },

  /* ------------------ */
  downloadAsText() {
    let
      str = GUI.field.value,
      title = ArticleParser.generateBrief(str) || 'article';

    ArticleParser.downloadAsFile(GUI.field.value, `${title}.txt`);
  },

  /* ------------------ */
  findAndReplace(previewOnly) {
    let str = GUI.field.value;
    str = ArticleParser.findAndReplace(str, previewOnly);

    if (!previewOnly)
      GUI.field.value = str;
  },
};

/* ============================================================================================= */
/* ============================================================================================= */
/* ============================================================================================= */

ArticleParser = {
  // Константы
  const: {
    urlSection:    '<!-- URL Section -->',
    tabsToSpaces:  4,
    gDocsImgWidth: '295px',
  },

  /* ------------------------------------------------------------------------------------------- */
  // Пропускает текст через toMarkdown (HTML => Markdown)
  HTMLtoMarkdown(str) {
    return toMarkdown(str, {
      converters: [{
        filter: [
          'div',
          'span',
          'figure',
          'article',
          'small',
          'section',
          'footer',
          'header',
          'meta',
          'picture',
          'source',
          'aside',
          'main',
        ],
        replacement(content) { return content; },
      }, {
        filter: 'figcaption',
        replacement(content) { return `\n${content}`; },
      }, {
        filter: 'canvas',
        replacement() { return ''; },
      }, {
        filter: 'pre',
        replacement(content) {
          return `\`\`\`\n${content}\n\`\`\``;
        },
      }, {
        filter: 'code',
        replacement(content) { return `\`${content}\``; },
      }],
    });
  },

  /* ------------------------------------------------------------------------------------------- */
  // Корректирует HTML код до конвертации в markdown (HTML => Markdown)
  prepareHTMLforMarkdown(str) {
    return str

      // // Экранирование символов
      // // TODO: UNESCAPE - метка, если нужно будет удалить
      // .replace(/([*_`])/g, '\\$1')

      // <iframe>, <video> ==> (( iframe: url )), (( video: url ))
      // Оборачивание в <p> нужно для того, чтобы элемент гарантированно попал на новую строку
      .replace(/<(video|iframe).*?src="(.*?)".*?<\/\1>/g, '<p>(( $1: $2 ))</p>')

      // <pre><code> ==> <pre> (три ```)
      // Оборачивание в <p> происходит по той же причине
      .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, '<p><pre>$1</pre></p>');
  },

  /* ------------------------------------------------------------------------------------------- */
  // Корректирует HTML код после конвертации в markdown (Markdown => HTML)
  fixHTML(str) {
    return str

      // На всякий случай
      .replace(ArticleParser.const.urlSection, '')

      // (( tag: url )) ==> <tag src="url"></tag>
      .replace(/\(\(\s*(\S*):\s*(.*?)\s*\)\)/g, '<$1 src="$2"></$1>');
  },

  /* ------------------------------------------------------------------------------------------- */
  // Исправляет ошибки и прочие мелочи поверх toMarkdown (HTML => Markdown)
  fixMarkdown(str) {
    // let unescape = (str) => str.replace(/\\([*_`])/g, '$1');

    return str

      // // «Разэкранизация» экранизированных символов в блоках кода в prepareHTMLforMarkdown
      // // TODO: UNESCAPE - метка, если нужно будет удалить
      // .replace(/(```|`)([\s\S]+?)\1/g, (str, graves, code) => {
      //   return unescape(code);
      // })
      // 
      // // «Разэкранизация» (( скобок )) (iframe, video)
      // // TODO: UNESCAPE - метка, если нужно будет удалить
      // .replace(/(\(\(.*?\)\))/g, (str, code) => {
      //   return unescape(code);
      // })

      // TODO: Неактуальный код. Если проблем не будет, то удалить его
      // // Идущие друг за другом блоки кода
      // .replace(/``````/g, '')
      // 
      // // Неперенесённый на новую строку блок кода (до)
      // .replace(/(\S)(```)/g, (str, char, graves) => {
      //   return `${char}\n${graves}`;
      // })
      // 
      // // Неперенесённый на новую строку блок кода (после)
      // .replace(/(```)(\S)/g, (str, graves, char) => {
      //   return `${graves}\n${char}`;
      // })

      // // iFrame
      // .replace(/<iframe.*?src="(.*?)".*?<\/iframe>/g, (str, url) => {
      //   return `( iframe: ${url} )`;
      // })

      // Странный баг (баг ли?), когда точка, идущая за цифрой, превращается в «\.»
      .replace(/(\d)\\\./g, (str, number) => {
        return `${number}.`;
      });
  },

  /* ------------------------------------------------------------------------------------------- */
  // Выносит все ссылки в отдельный блок в конце (HTML => Markdown)
  tidyMarkdownLinks(str) {
    let
      regexp = /([^!]\[.*?\])\((.*?)\)/g,
      urls = [],
      i = 0;

    // Вынос всех ссылок массив и их замена в тексте на сокращения вида '#1'
    str = str.replace(regexp, (str, title, url) => {
      i++;
      urls.push(`[#${i}]: ${url}`);
      return `${title}[#${i}]`;
    });

    // Приписывание ссылок к тексту
    if (urls.length)
      str += `\n\n${ArticleParser.const.urlSection}\n${urls.join('\n')}`;

    return str;
  },

  /* ------------------------------------------------------------------------------------------- */
  // Конвертирует текст в таблицу, которую сможет прочитать Google Docs
  convertIntoTable(str) {
    let
      regexpTable         = /(?:\n\n|^)?([\s\S]+?)(?:\n\n|$)/g, // Всё, что между \n\n
      regexpCodeBlock     = /(```|`)([\s\S]+?)\1/g,             // Блоки кода, заключённые в одну или три кавычки
      regexpDoubleBracket = /\(\(\s*(\S*):\s*(.*?)\s*\)\)/g;    // Текст вида (( iframe: url ))

    // Защита блоков кода от дробления, пропадающих пробелов и прочего
    str = str.replace(regexpCodeBlock, (str, graves, code) => {
      code = code
        .replace(/ /g, '&nbsp;')
        .replace(/\t/g, '&nbsp;'.repeat(ArticleParser.const.tabsToSpaces))
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `${graves}${code}${graves}`;
    });

    // Делает короткие ссылки вида «[описание][#1]» кликабельными
    {
      let
        urlsRaw = str.match(/^\[#\d+\]: .*?$/gm),
        urls = {},
        urlSection = '';

      // Превращает список ссылок в объект
      if (urlsRaw) urlsRaw.forEach(str => {
        let [, id, url] = str.match(/\[#(\d+)\]: (.*)/);
        urls[id] = url;
      });

      // Делает их кликабельными
      str = str.replace(/(\])\[#(\d+)\]/g, (str, rest, currID) =>
        `${rest}<a href="${urls[currID]}">[#${currID}]</a>`
      );
    };

    // Конвертация всего в таблицу
    str = str.replace(regexpTable, (str, content) => {
      let
        wrapper = ['<p>', '</p>'],
        rightSide = '',
        result = '';

      // Убирает возможные переносы на новую строку в начале текста (regexpTable захватывает лишние)
      content = content.trim();

      // Если начинается с # (заголовок)
      if (content.startsWith('#')) {
        rightSide = `${content.match(/#+/)[0]}&nbsp;`;
      }

      // ``` (блок кода)
      else if (content.startsWith('```')) {
        wrapper = [`<p style="font-size: .5em; font-family: 'Courier New'">`, '</p>'];
        rightSide = content;
      }

      // ![ (картинка)
      else if (content.startsWith('![')) {
        let
          [, alt, src] = content.match(/!\[(.*?)\]\((.*?)\)/),
          imgWidth = ArticleParser.const.gDocsImgWidth,
          img = `<img width='${imgWidth}' alt='${alt}' src='${src}'>`,
          altCaption = alt ? `<br><i>Alt: ${alt}</i>` : '',
          clickableUrl = `![${alt || ''}](<a href="${src}">${src}</a>)`,
          mdText = `<p><br>${clickableUrl}</p>`;

        content = `${img}${altCaption}${mdText}`;
        rightSide = '![]()';
      }

      // > (цитата)
      else if (content.startsWith('>')) {
        rightSide = '>&nbsp;';
      }

      // * * * (разделитель)
      else if (content.startsWith('* * *')) {
        // rightSide = `${content.match(/\*\s+/)[0]}`;
        rightSide = '* * *';
      }

      // * (списиок)
      else if (content.startsWith('* ')) {
        // rightSide = `${content.match(/\*\s+/)[0]}`;
        rightSide = '*&nbsp;';
      }

      // Список ссылок: продублировать полностью, сделать кликабельными
      // и подровнять по краям (по факту, убирает перенос на новую строку в начале)
      else if (content.startsWith(ArticleParser.const.urlSection)) {
        wrapper = [`<p style="font-family: 'Courier New'">`, '</p>'];

        // Делает ссылки
        content = content
          .replace(ArticleParser.const.urlSection, '')
          .replace(/\]: (.*?)$/gm, ']: <a href="$1">$1</a>')
          .trim();

        rightSide = content;
      }

      result += `<tr><td>${wrapper[0]}${content}${wrapper[1]}</td>`;
      result += `<td>${wrapper[0]}${rightSide}${wrapper[1]}</td></tr>`;

      return result;
    });

    // «Экранизация» всех оставшихся переносов и пробелов;
    // кликабельность «тегов» вида (( iframe: url )) 
    str = str
      .replace(/\n/g, '<br>')
      .replace(/  /g, '&nbsp;&nbsp;')
      .replace(regexpDoubleBracket, '(( $1: <a href="$2">$2</a> ))');

    return `<style>td{padding:5pt;}</style><table><tbody>${str}</tbody></table>`;
  },

  /* ------------------------------------------------------------------------------------------- */
  // Скачивает текст файлом
  downloadAsFile(str, fileName) {
    let a = document.createElement('a');
    a.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(str)}`);
    a.setAttribute('download', fileName);
    a.click();
  },

  /* ------------------------------------------------------------------------------------------- */
  // Читает zip файл из input и передаёт прочитанный хтмл текст в parseGDocsFile
  // textarea нужен для того, чтобы вывести туда обработанный текст (да, эдакий костыль вышел)
  readZip(file, textarea) {
    JSZip.loadAsync(file)
      .then(zip => {
        // Ищет первый попавшийся .html файл
        // (в теории, в архиве никаких других хтмлов кроме index.html и не бывает)
        let fileName = Object.keys(zip.files).filter(fname => fname.endsWith('.html'))[0];
        return zip.files[fileName];
      })
      .then(file => {
        return new Promise(done => {
          file.async('string').then(done);
        });
      })
      .then(html => { ArticleParser.parseGDocsFile(html, textarea); });
  },

  /* ------------------------------------------------------------------------------------------- */
  // Парсит таблицу из Google Docs, запакованную в zip архив
  parseGDocsFile(html, textarea) {
    let
      dom = new DOMParser().parseFromString(html, 'text/html'),
      res = '';

    // Находит все ячейки второго столбца таблицы
    [...dom.querySelectorAll('tr td:nth-child(2)')].forEach(row => {
      let paragraph = '';

      // Обрабатывает каждую строку в ячейке
      [...row.children].forEach(el => {
        if (!el.textContent) return;

        // Если тег P (обычный текст)
        if (el.tagName == 'P') {
          paragraph += `${el.textContent}\n`;
        }

        // Если тег LI (список)
        else if (el.tagName == 'UL') {
          [...el.children].forEach(li => {
            paragraph += `*   ${li.textContent}\n`;
          });
        }

        // Если ничего не подошло, вывести как есть (для дебага)
        else {
          paragraph += `${el.tagName}:${el.innerHTML}\n`;
        }
      });
      res += paragraph ? `${paragraph}\n` : '';

    });
    textarea.value = res;
  },

  /* ------------------------------------------------------------------------------------------- */
  // Читает текстовый файл
  readTextFile(file, textarea) {
    let reader = new FileReader();
    reader.onload = e => { textarea.value = e.target.result; };
    reader.readAsText(file);
  },

  /* ------------------------------------------------------------------------------------------- */
  // Очищает все элементы от всех атрибутов помимо тех, которые указаны в whiteList
  cleanTags(str) {
    let
      dom       = new DOMParser().parseFromString(str, 'text/html'),
      elements  = [...dom.querySelectorAll('*')],
      whiteList = {
        IMG:    ['src', 'alt'],
        A:      ['href'],
        IFRAME: ['src'],
        VIDEO:  ['src'],
      };


    for (let i = 0; i < elements.length; i++) {
      let el = elements[i];

      // Если элемент из белого списка
      if (whiteList[el.tagName]) {
        [...el.attributes].forEach(({name: attr}) => {
          if (!whiteList[el.tagName].includes(attr))
            el.removeAttribute(attr);
        });
      }

      // Не из белого списка, значит удалить все атрибуты без разбора
      else {
        while (el.attributes.length > 0)
          el.removeAttribute(el.attributes[0].name);
      }
    }

    return dom.body.innerHTML;
  },

  /* ------------------------------------------------------------------------------------------- */
  // Генерирует короткое описание статьи
  generateBrief(str) {
    let title = str.match(/^(.*?)\n/);
    if (title) {
      title = title[1]
        .replace(/[#\\/:*?"<>|]/g, '')
        .trim();
      title = Tools.brief(title, 100);
    }
    return title || null;
  },

  /* ------------------------------------------------------------------------------------------- */
  // Производит поиск и замену текста по регуляркам
  findAndReplace(str, previewOnly) {

    let
      from = GUI.replace.from.value,
      to = GUI.replace.to.value,
      bareRegExp = GUI.replace.useBareRegExp.checked,
      fromOrig = from;

    // Экранизация символов, чтоб не мешались. И замена ** на регулярку, что ищет всё
    if (!bareRegExp)
      from = from
        .replace(/([.+![\](){}^-])/g, '\\$1')
        .replace(/\*\*/g, '([\\s\\S]*?)');

    // Если не предпросмотр, то просто заменить все совпадения и выйти
    if (!previewOnly) {
      if (from == '') {
        alert('Нет смысла заменять пустоту');
        return str;
      } else {
        return str.replace(new RegExp(from, 'gi'), to);
      }
    }

    // Результат замены ищется через оборачивание в «!!---текст---!!»
    // в надежде на то, что эта комбинация символов больше нигде никогда не встретится
    let
      regexp = new RegExp(from, 'gi'),
      source = str.match(regexp),
      newStr = str.replace(regexp, `!!---${to}---!!`).match(/!!---([\s\S]*?)---!!/);

    // Для источника берёт всё совпадение, а для новой строки
    // вытаскивает первое (потому что его нашло странным кодом выше)
    source = source ? source[0] : null;
    newStr = newStr ? newStr[1] : null;

    if (from == '') {
      alert('Нужно ввести хоть что-нибудь, прежде чем жать на предпросмотр');
    } else if (source) {
      alert(`Нашёл:\n\n${source}\n\n-------------------------\n\nЗаменил на:\n\n${newStr}`);
    } else {
      alert(`По следующему запросу ничего не найдено:\n\n${fromOrig}`);
    };
  },
};

/* ============================================================================================= */
/* ============================================================================================= */
/* ============================================================================================= */

Tools = {
  getJsTree(DomEl = document.body, keepClasses = false, base = '0') {
    /* getJsTree v1.0.3 */
    let result = {}, isEl, isObj, setInnumerable, buildTree;
    isEl = el => (el instanceof Element);
    isObj = el => (!isEl(el) && el instanceof Object);
    setInnumerable = (obj, key, val) => Object.defineProperty(obj, key, {
      value:        val,
      configurable: true,
      writable:     true,
      enumerable:   false,
    });
    buildTree = (dest, path, el) => {
      let name = path.pop();
      path.forEach(curr => {
        let here = dest[curr];
        if (!here) {
          dest[curr] = {};
        } else if (isEl(here)) {
          dest[curr] = {};
          setInnumerable(dest[curr], base, here);
        }
        dest = dest[curr];
      });
      if (isObj(dest[name]))
        setInnumerable(dest[name], base, el);
      else
        dest[name] = el;
    };

    DomEl.querySelectorAll('[class*="j-"]').forEach(el => {
      el.classList.forEach(cl => {
        if (cl.startsWith('j-')) {
          if (!keepClasses) el.classList.remove(cl);
          buildTree(result, cl.slice(2).split('-'), el);
        }
      });
    });

    return result;
  },

  /* ------------------------------------------------------------------------------------------- */
  brief(str, length = 150, strict = false) {
    if (!Number.isInteger(length) || length <= 0)
      throw new Error(`${length} is not a valid number`);

    let brief = str
      .replace(/\s\s+/g, ' ')      // Все двойные пробелы на одиночный
      .replace(/^\s+/g, '');       // Пробелы в начале, если есть

    // Если длина текста входит в указанный лимит, то просто вернуть его
    if (brief.length <= length) return brief;

    // Иначе обрезать до нужной длины и вернуть
    if (strict) {
      // Строгий режим, обрезает строго до определённой длинны
      let valid = (length-1 >= 1);
      return `${brief.slice(0, valid ? length-1 : 0)}…`;
    } else {
      // Обычный режим, с умной обрезкой слов
      brief = brief.slice(0, length).match(/(^.+) /);
      return brief ? `${brief[1]}…` : '';
    }
  },
};

document.addEventListener('DOMContentLoaded', () => Core.init());
