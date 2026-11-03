import PageHeader from '../components/PageHeader';
import ReportPanel from '../components/ReportPanel';

export default function Reports() {
  return (
    <div className="flat-dashboard">
      <PageHeader title="Reports" description="Download a report for one branch or all of them. Pick what you need, then choose a format." />
      <div className="flat-card" style={{ padding: 20, maxWidth: 560 }}>
        <ReportPanel />
      </div>
    </div>
  );
}
