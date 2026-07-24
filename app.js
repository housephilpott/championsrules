let glossary = [];

fetch("glossary.json")
    .then(response => response.json())
    .then(data => {
        glossary = data;
        render(glossary);
    });

document
    .getElementById("search")
    .addEventListener("input", event => {

        const query = event.target.value.toLowerCase();

        const results = glossary.filter(entry =>
            entry.term.toLowerCase().includes(query) ||
            entry.definition.toLowerCase().includes(query)
        );

        render(results);
    });

function render(entries) {

    const resultsDiv = document.getElementById("results");

    resultsDiv.innerHTML = entries.map(entry => `
        <div class="entry">
            <div class="term">${entry.term}</div>
            <p>${entry.definition}</p>

            <small>
                See also:
                ${entry.seeAlso.join(", ")}
            </small>
        </div>
    `).join("");
}
