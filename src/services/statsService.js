const { fetchWithRetry } = require('./mlsService');
const { MLS_GRID_BASE_URL, COMPANY_FOUNDED_YEAR } = require('../config');
const { BROKERAGE } = require('./searchEngine');

async function getCompanyStats() {
  const currentYear = new Date().getFullYear();
  const yearsExp = currentYear - COMPANY_FOUNDED_YEAR;

  const [activeResult, agentResult] = await Promise.allSettled([
    fetchActivePropertyCount(),
    fetchAgentCount(),
  ]);

  const propertiesListed = activeResult.status === 'fulfilled'
    ? activeResult.value
    : null;

  const expertAgents = agentResult.status === 'fulfilled'
    ? agentResult.value
    : null;

  return {
    success: true,
    data: {
      propertiesListed: {
        value: propertiesListed,
        suffix: '+',
        label: 'Properties Listed',
      },
      expertAgents: {
        value: expertAgents,
        suffix: '+',
        label: 'Expert Agents',
      },
      yearsExperience: {
        value: yearsExp,
        suffix: '+',
        label: 'Years Experience',
      },
    },
  };
}

async function fetchActivePropertyCount() {
  const url = `${MLS_GRID_BASE_URL}/Property?$top=1&$count=true&$filter=StandardStatus eq 'Active'`;
  const data = await fetchWithRetry(url);
  return data['@odata.count'] || null;
}

async function fetchAgentCount() {
  const officeId = BROKERAGE.LIST_OFFICE_MLS_ID;
  const url = `${MLS_GRID_BASE_URL}/Member?$top=1&$count=true&$filter=OfficeMlsId eq '${officeId}'`;
  const data = await fetchWithRetry(url);
  return data['@odata.count'] || null;
}

module.exports = { getCompanyStats };
