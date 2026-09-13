import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main>
      <p className="eyebrow">Park and Ride to Work</p>
      <h1>Fairer shared journeys, every week.</h1>
      <p className="intro">
        Submit your work days, view the group rota, and share driving fairly.
      </p>
      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading">Foundation deployed</h2>
        <p>
          The schedule-submission screen is the next feature to be added.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
