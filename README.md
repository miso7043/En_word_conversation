# English Conversation Practice

English Conversation Practice is a browser-based listening tool for learners who want to hear English expressions in context. Each lesson is a JSON file containing one or more dialogues, with optional explanations and translations. The app uses browser speech synthesis to read the English dialogue aloud and gives each speaker a voice.

The interface is in Korean, and the included lessons can display Korean explanations and translations. The English dialogue is the part read aloud.

## Features

- **Lesson library.** The sidebar uses each JSON file's `title` and sorts lessons newest first. The first lesson opens automatically. Long lists scroll independently above the playback controls on desktop.
- **Dialogue view.** The main panel displays the lesson explanation, dialogue titles, speaker labels, English lines, and any supplied translations. Each dialogue shows the assigned voice names and locales when voices are available.
- **Playback controls.** The play icon switches to pause during playback. Pausing preserves the current position. The separate **Stop** button cancels playback, resets it to the first line, and scrolls the page to the top.
- **Play from a line.** Click a speaker button such as **A** or **B** to jump to that line. Playback continues through the remaining lines of the selected lesson, including subsequent dialogues.
- **Follow-along reading.** The current line is highlighted and scrolled into view. The progress display counts lines across the selected lesson, and scrolling respects the browser's reduced-motion preference.
- **Voice rotation.** The app selects from available US, Canadian, UK, and Australian English voices. A speaker keeps the same voice within a dialogue, and the assignment rotates between dialogues when multiple eligible voices are available.

## Project structure

| Path | Purpose |
| --- | --- |
| `conversation.html` | The app's HTML, CSS, JavaScript, and embedded starter lessons |
| `json/Dish it out.json` | Dialogues for “Dish it out but can't take it” |
| `json/inFavorOf.json` | Dialogues for “in favor of” |
| `json/tally.json` | Dialogues for “tally” |
| `README.md` | Setup, lesson format, and implementation guide |

## Run locally

A browser with speech synthesis and at least one eligible English voice is required for audio. The app itself uses plain HTML, CSS, and JavaScript. Python 3 is used for the local server option.

### Load the current JSON folder automatically

1. Open a terminal in the folder containing `conversation.html`.
2. Start the local server.

   ```bash
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

3. Open [the local conversation page](http://127.0.0.1:8765/conversation.html).
4. Refresh the page after adding, editing, or removing a JSON file. The app reads the server's directory listing and loads the files it finds.

Keep the terminal running while using the page. Press `Ctrl+C` in the terminal to stop the server.

### Open the HTML file directly

Double-click `conversation.html` to open the three lessons embedded in the file. To load current or additional lessons, use the folder picker in the sidebar and select the `json` folder. Direct file access uses the embedded snapshot until a folder is selected because browser security rules restrict automatic reads of neighboring files from a `file://` page.

## Add a lesson

Create a UTF-8 file such as `json/make-a-point.json` with this structure.

```json
{
  "title": "Make a point",
  "date": "2026-11-12T09:00:00+09:00",
  "description": [
    "To make a point is to express an idea or argument clearly."
  ],
  "conversations": [
    {
      "id": 1,
      "title": "During a team meeting",
      "description": "Two colleagues discuss a proposed schedule.",
      "lines": [
        {
          "speaker": "A",
          "text": "I'd like to make a point about the schedule.",
          "meaning": "I'd like to draw attention to something about the schedule."
        },
        {
          "speaker": "B",
          "text": "Go ahead. What are you concerned about?"
        }
      ]
    }
  ]
}
```

| Field | Required | Behavior |
| --- | --- | --- |
| `title` | Yes | String shown in the lesson list and at the top of the lesson |
| `date` | No | Parseable date used to sort lessons. Use an ISO 8601 timestamp for consistent ordering across devices. |
| Lesson or dialogue `description` | No | String or array of strings rendered as separate paragraphs |
| `conversations` | Yes | Array of dialogues, shown in the order supplied |
| Dialogue `title` and `id` | No | The title takes priority. Without a title, the app displays a dialogue label using its ID or position. |
| Dialogue `lines` | Yes | Array of lines in reading order |
| Line `speaker` and `text` | Yes | String values used for the speaker button and the spoken English line |
| Line `meaning` | No | Translation or gloss shown below the line |

Use the same speaker label each time a character speaks within a dialogue. When `date` is omitted, sorting uses the server's `Last-Modified` header, the selected file's modification time, or the saved timestamp for an embedded lesson. Equal dates are sorted by filename. Displayed dates use Seoul time.

## How the code works

### Loading and rendering

- `loadFromServer()` requests `./json/`, parses the HTML directory listing with `DOMParser`, and keeps unique links to JSON files directly inside that directory. It fetches those files with cache revalidation.
- Direct file mode passes the embedded lessons to the same loader. The folder picker uses the browser's file input and reads the selected JSON files with `File.text()`.
- `readDocument()` checks the required fields and resolves the sorting timestamp. `loadDocuments()` uses `Promise.allSettled()` so a malformed file can be reported by name while valid files still load. A version counter prevents a slower earlier load from overwriting a newer selection.
- `showDocument()` builds the lesson with DOM elements and `textContent`, so JSON strings render as text. It keeps both the dialogue groups used for voice assignment and a flat list used for sequential playback. Speaker buttons store their corresponding position in the flat list.
- CSS Grid places the lesson list beside the main content on desktop. The sidebar uses a scrollable list row with the controls in a separate row below it. On narrow screens, the sidebar stacks above the lesson.

### Voice assignment

- `refreshVoices()` reads the voice list through `speechSynthesis.getVoices()` and listens for the browser's `voiceschanged` event. Voice updates are applied while playback is idle.
- The app filters for `en-US`, `en-CA`, `en-GB`, and `en-AU`, removes duplicates, and interleaves voices from the available regions. Child and novelty voices are filtered by name. The name filter is approximate, and the available voices depend on the device and browser.
- `assignVoices()` takes speakers in their first-appearance order and gives each a voice from the rotating list. The starting position advances with each dialogue across lessons. If a dialogue has more speakers than eligible voices, assignments wrap and some speakers share a voice. Audio controls are disabled when no eligible voice is available.

### Playback

- Playback uses three states, `idle`, `playing`, and `paused`. `updateControls()` synchronizes the play or pause icon, accessible label, and button availability with those states.
- `speakCurrent()` creates one `SpeechSynthesisUtterance` per line, applies the assigned voice and locale, and sets the speech rate to `0.95`. The utterance's `end` event advances to the next line. Its `error` event resets playback and shows an error message.
- `startOrResume()` resumes an existing paused utterance or starts reading from the current index. Clicking a speaker button first cancels current playback and then starts at that line.
- `resetPlayback()` clears the active utterance and highlight, restores the first-line position, and refreshes the controls. Utterance callbacks check that they still belong to the active utterance so canceled audio cannot advance a newer playback session.

## Hosting and troubleshooting

- **Hosting on a static site.** Publish `conversation.html` and the `json/` folder together. Automatic discovery requires `./json/` to return an HTML page with links to the JSON files. If your host does not generate directory listings, supply a `json/index.html` containing those links and keep it up to date. This also applies to a GitHub Pages deployment.
- **New files are missing.** In local server mode, refresh the page and check that the file is directly inside `json/`. In direct file mode, select the folder again to load its current contents.
- **A JSON file fails to load.** Run `python3 -m json.tool "json/your-file.json"` to check the syntax, then confirm that `title`, `conversations`, `lines`, `speaker`, and `text` are present at the appropriate levels. JSON does not permit trailing commas.
- **The play button is disabled.** Check that the lesson has dialogue lines and that your browser exposes a voice in one of the four supported English locales.

## References

- [Python documentation for the local HTTP server](https://docs.python.org/3/library/http.server.html)
- [MDN documentation for browser speech synthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
- [MDN explanation of local file URL restrictions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp)
- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
