import type { CompanyPerformancePoint } from './lib/api';

const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export default function CompanyPerformanceChart({ data, daysInPeriod }: { data: CompanyPerformancePoint[]; daysInPeriod: number }) {
  const averageUnitsByCompany = data.map((item) => ({ ...item, averageUnitsPerDay: item.unitsSold / daysInPeriod }));
  const highestAverage = Math.max(...averageUnitsByCompany.map((item) => item.averageUnitsPerDay), 0);

  return <div className="company-performance-chart" role="table" aria-label="Average units sold per day by company" style={{ height: 'auto', minHeight: Math.max(350, data.length * 56 + 40) }}>
    <div className="company-performance-row company-performance-header" role="row">
      <span role="columnheader">Sales company</span>
      <span role="columnheader">Average units sold / day</span>
    </div>
    {averageUnitsByCompany.map((item) => <div className="company-performance-row" role="row" key={item.farmId}>
      <strong className="company-performance-name" role="rowheader">{item.companyName}</strong>
      <div className="company-performance-metric" role="cell">
        <strong>{quantity.format(item.averageUnitsPerDay)}</strong>
        <div className="company-performance-track" aria-hidden="true">
          <span className="company-performance-units-bar" style={{ width: `${highestAverage ? item.averageUnitsPerDay / highestAverage * 100 : 0}%` }} />
        </div>
      </div>
    </div>)}
  </div>;
}
