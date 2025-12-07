# Sample Markdown Document

This is a comprehensive sample to test all markdown features.

## Headings

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

## Text Formatting

This is **bold text** and this is __also bold__.

This is *italic text* and this is _also italic_.

This is ***bold and italic*** text.

This is ~~strikethrough~~ text.

This is `inline code` in a sentence.

## Links and Images

Here is a [link to Google](https://www.google.com).

Here is a [link with title](https://www.example.com "Example Site").

Here is an image: ![Alt text](./images/logo.png)

Here is an image with title: ![Logo](../images/springbok-logo.png 'Springbok Logo')

## Lists

### Unordered Lists

- First item
- Second item
- Third item
  - Nested item 1
  - Nested item 2
    - Deep nested item

* Alternative bullet style
* Another item

### Ordered Lists

1. First ordered item
2. Second ordered item
3. Third ordered item
   1. Nested ordered item
   2. Another nested item

### Task Lists

- [ ] Unchecked task
- [x] Checked task
- [ ] Another task

## Blockquotes

> This is a blockquote.
> It can span multiple lines.

> Nested blockquotes:
>> This is nested inside.
>>> Even deeper nesting.

## GitHub Alerts

> [!NOTE]
> Useful information that users should know, even when skimming content.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate user attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.

## Code

Inline `code` looks like this.

```javascript
// Code block with syntax highlighting
function greet(name) {
    console.log(`Hello, ${name}!`);
    return true;
}
```

```python
# Python code block
def hello_world():
    print("Hello, World!")
    return None
```

```
Plain code block without language
Just some text here
```

## Horizontal Rules

Above the line

---

Between lines

***

Below another line

___

End of rules section

## Tables

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

| Left | Center | Right |
|:-----|:------:|------:|
| L1   |   C1   |    R1 |
| L2   |   C2   |    R2 |

## Special Characters

Escape special characters: \*not italic\* and \`not code\`

HTML entities: &copy; &reg; &trade;

Emojis: 🎉 🚀 ✨ 👍

## Math (if supported)

Inline math: $E = mc^2$

Block math:

$$
\sum_{i=1}^{n} x_i = x_1 + x_2 + \cdots + x_n
$$

## Footnotes

Here is a sentence with a footnote[^1].

[^1]: This is the footnote content.

## Definition Lists

Term 1
: Definition for term 1

Term 2
: Definition for term 2

## Abbreviations

The HTML specification is maintained by the W3C.

*[HTML]: Hyper Text Markup Language
*[W3C]: World Wide Web Consortium

## Line Breaks

First line with two spaces at end  
Second line after soft break

First paragraph.

Second paragraph after blank line.

---

End of sample document.
