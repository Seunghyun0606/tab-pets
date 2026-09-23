const root = document.querySelector<HTMLElement>('#app');

if (root === null) {
  throw new Error('Tab Pets home root was not found.');
}

root.innerHTML = `
  <main class="home-shell" aria-labelledby="home-title">
    <p class="eyebrow">Runtime foundation</p>
    <h1 id="home-title">Tab Pets</h1>
    <p class="message">Momo's home is getting ready.</p>
  </main>
`;

