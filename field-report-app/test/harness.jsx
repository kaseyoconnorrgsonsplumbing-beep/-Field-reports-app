// Dev-only harness: exercises PhotoEditor and the PDF builder without Firebase.
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import PhotoEditor from '../src/components/PhotoEditor';
import { buildReportPdf } from '../src/pdf';
import '../src/styles.css';

async function toDataUrl(url) {
  const b = await (await fetch(url)).blob();
  return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
}

function Harness() {
  const [photo, setPhoto] = useState(null);
  const [saved, setSaved] = useState(null);
  React.useEffect(() => { toDataUrl('/test/sample.jpg').then((original) => setPhoto({ original })); }, []);

  window.__buildPdf = async () => {
    const photos = { p1: saved || photo, p2: photo };
    const report = {
      id: 'abc12345',
      title: 'Plumbing Inspection Report – 4821 E Speedway Blvd',
      clientName: 'Desert Ridge Property Management',
      address: '4821 E Speedway Blvd, Tucson, AZ 85712',
      contactName: 'Maria Lopez', contactPhone: '520-555-0148', contactEmail: 'maria@example.com',
      date: '2026-09-10', preparedBy: 'Kasey O\'Connor', reportNumber: 'WO-20419',
      summary: 'RG & Sons performed a walk-through plumbing inspection of the property at the request of the property manager. Three issues were identified, ranging from an active leak under the master bathroom sink to a water heater approaching the end of its service life. Overall the plumbing system is in fair condition; the items below are listed in order of priority.',
      closing: 'Pricing is valid for 30 days and includes labor and standard materials for the work described. Any additional issues discovered once work begins will be reviewed with you before proceeding. RG & Sons Plumbing, Inc. · ROC 107477 C-37 · ROC 107467 R37R',
      issues: [
        { id: 'a', title: 'Leaking P-Trap – Master Bathroom', location: 'Master bathroom, under vanity sink', price: '285', photoIds: ['p1', 'p2'],
          finding: 'The P-trap under the master bathroom lavatory sink is actively leaking at the slip-joint connection. The cabinet floor beneath the trap shows swelling and staining, indicating the leak has been present for some time. Continued leaking will further damage the cabinet and can promote mold growth.',
          recommendation: 'Replace the P-trap and tailpiece assembly with a new PVC trap, new slip-joint washers, and reseal the connections. Inspect the cabinet floor after repair; replacement of the cabinet floor panel would be a separate carpentry item.' },
        { id: 'b', title: 'Corroded Angle Stops – Kitchen', location: 'Kitchen sink, hot and cold supplies', price: '190', photoIds: ['p1'],
          finding: 'Both angle stops under the kitchen sink show heavy green corrosion at the compression fittings and the hot-side valve will not fully close. A valve that will not shut off leaves no way to isolate the fixture in an emergency.',
          recommendation: 'Replace both angle stops with new quarter-turn ball-valve stops and new braided stainless supply lines.' },
        { id: 'c', title: 'Water Heater Past Service Life – Garage', location: 'Garage', price: '2450', photoIds: [],
          finding: 'The 50-gallon gas water heater has a manufacture date of 2011, putting it at roughly 15 years of service. Rust is visible at the base of the tank and the T&P discharge line terminates inside the drain pan rather than to an approved location.',
          recommendation: 'Plan for replacement of the water heater with a new 50-gallon gas unit including a new drain pan, expansion tank, and a code-compliant T&P discharge line. We can price a tankless option on request.' },
      ],
    };
    const doc = await buildReportPdf(report, photos);
    return doc.output('datauristring');
  };

  if (!photo) return <div>loading</div>;
  return (
    <div>
      {saved ? <img id="saved" src={saved.annotated} style={{ maxWidth: 600 }} /> : (
        <PhotoEditor photo={photo} onSave={async (r) => setSaved({ ...photo, ...r })} onCancel={() => {}} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Harness />);
