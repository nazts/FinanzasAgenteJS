import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { CHART_COLORS } from '../config/constants.js';

const WIDTH = 600;
const HEIGHT = 400;

const renderer = new ChartJSNodeCanvas({ width: WIDTH, height: HEIGHT, backgroundColour: 'white' });

/**
 * Generate a pie chart showing expense distribution.
 * @param {{ needs: number, wants: number, savings: number }} data
 * @returns {Promise<Buffer>}
 */
export async function generatePieChart(data) {
  const config = {
    type: 'pie',
    data: {
      labels: ['🏠 Necesidades', '🎉 Gustos', '💎 Ahorro'],
      datasets: [
        {
          data: [
            parseFloat(data.needs.toFixed(2)),
            parseFloat(data.wants.toFixed(2)),
            parseFloat(data.savings.toFixed(2)),
          ],
          backgroundColor: [CHART_COLORS.needs, CHART_COLORS.wants, CHART_COLORS.savings],
          borderWidth: 2,
          borderColor: '#fff',
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Distribución de Gastos del Mes',
          font: { size: 18 },
        },
        legend: { position: 'bottom' },
      },
    },
  };
  return renderer.renderToBuffer(config);
}

/**
 * Generate a bar chart comparing real vs ideal 50/30/20.
 * @param {{ needs: number, wants: number, savings: number }} realData
 * @param {{ needs: number, wants: number, savings: number }} idealData
 * @returns {Promise<Buffer>}
 */
export async function generateBarChart(realData, idealData) {
  const config = {
    type: 'bar',
    data: {
      labels: ['🏠 Necesidades', '🎉 Gustos', '💎 Ahorro'],
      datasets: [
        {
          label: 'Real',
          data: [
            parseFloat(realData.needs.toFixed(2)),
            parseFloat(realData.wants.toFixed(2)),
            parseFloat(realData.savings.toFixed(2)),
          ],
          backgroundColor: [CHART_COLORS.needs, CHART_COLORS.wants, CHART_COLORS.savings],
        },
        {
          label: 'Ideal (50/30/20)',
          data: [
            parseFloat(idealData.needs.toFixed(2)),
            parseFloat(idealData.wants.toFixed(2)),
            parseFloat(idealData.savings.toFixed(2)),
          ],
          backgroundColor: CHART_COLORS.ideal,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Real vs Ideal (Regla 50/30/20)',
          font: { size: 18 },
        },
        legend: { position: 'bottom' },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => `$${value.toLocaleString()}`,
          },
        },
      },
    },
  };
  return renderer.renderToBuffer(config);
}
