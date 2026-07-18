const axios = require('axios');
const { MLS_GRID_BASE_URL, MLS_GRID_ACCESS_TOKEN, MLS_GRID_TIMEOUT, MLS_GRID_MAX_RETRIES } = require('../config');

function buildODataFilter(params) {
  const filters = [];

  if (params.originatingSystem) {
    filters.push(`OriginatingSystemName eq '${params.originatingSystem}'`);
  }

  if (params.listingId) {
    filters.push(`ListingId eq '${params.listingId}'`);
  }

  if (params.listingKey) {
    filters.push(`ListingKey eq '${params.listingKey}'`);
  }

  if (params.officeId) {
    filters.push(`ListOfficeMlsId eq '${params.officeId}'`);
  }

  if (params.memberId) {
    filters.push(`(MemberMlsId eq '${params.memberId}' or ListAgentMlsId eq '${params.memberId}')`);
  }

  if (params.status) {
    const statuses = Array.isArray(params.status) ? params.status : [params.status];
    const orClauses = statuses.map(s => `StandardStatus eq '${s}'`);
    filters.push(`(${orClauses.join(' or ')})`);
  }

  if (params.city) {
    filters.push(`City eq '${params.city}'`);
  }

  if (params.priceMin) {
    filters.push(`ListPrice ge ${params.priceMin}`);
  }

  if (params.priceMax) {
    filters.push(`ListPrice le ${params.priceMax}`);
  }

  if (params.beds) {
    const minBeds = parseInt(params.beds, 10);
    if (!isNaN(minBeds)) {
      filters.push(`BedroomsTotal ge ${minBeds}`);
    }
  }

  if (params.baths) {
    const minBaths = parseInt(params.baths, 10);
    if (!isNaN(minBaths)) {
      filters.push(`BathroomsTotalInteger ge ${minBaths}`);
    }
  }

  if (params.propertyType) {
    filters.push(`PropertySubType eq '${params.propertyType}'`);
  }

  if (params.mlgCanView !== undefined) {
    filters.push('MlgCanView eq true');
  }

  return filters.join(' and ');
}

function buildODataQuery(params) {
  const odata = [];

  const filter = buildODataFilter(params);
  if (filter) {
    odata.push(`$filter=${encodeURIComponent(filter)}`);
  }

  if (params.top) {
    odata.push(`$top=${params.top}`);
  } else {
    odata.push('$top=20');
  }

  if (params.skip) {
    odata.push(`$skip=${params.skip}`);
  }

  if (params.count !== false) {
    odata.push('$count=true');
  }

  odata.push('$expand=Media');

  if (params.orderby) {
    odata.push(`$orderby=${params.orderby}`);
  }

  return odata.join('&');
}

async function fetchWithRetry(url, options, retries = parseInt(MLS_GRID_MAX_RETRIES, 10) || 3) {
  const timeout = parseInt(MLS_GRID_TIMEOUT, 10) || 30000;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        ...options,
        timeout,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${MLS_GRID_ACCESS_TOKEN}`,
          Accept: 'application/json',
        },
      });
      return response.data;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function normalizeProperty(item) {
  if (!item) return null;

  const media = (item.Media || []).map(m => ({
    MediaKey: m.MediaKey,
    MediaURL: m.MediaURL || m.MediaUrl,
    MediaCategory: m.MediaCategory,
    Order: m.Order || m.Ordering,
    PreferredPhotoYN: m.PreferredPhotoYN,
  }));

  return {
    ListingId: item.ListingId,
    ListingKey: item.ListingKey,
    ListPrice: item.ListPrice,
    BedroomsTotal: item.BedroomsTotal,
    BathroomsTotalInteger: item.BathroomsTotalInteger,
    BathroomsFull: item.BathroomsFull,
    BathroomsHalf: item.BathroomsHalf,
    BathroomsTotal: item.BathroomsTotal,
    LivingArea: item.LivingArea,
    LotSizeArea: item.LotSizeArea,
    LotSizeSquareFeet: item.LotSizeSquareFeet,
    PropertySubType: item.PropertySubType,
    PropertyType: item.PropertyType,
    StandardStatus: item.StandardStatus,
    MlgCanView: item.MlgCanView,
    UnparsedAddress: item.UnparsedAddress,
    StreetNumber: item.StreetNumber,
    StreetName: item.StreetName,
    StreetSuffix: item.StreetSuffix,
    City: item.City,
    StateOrProvince: item.StateOrProvince,
    PostalCode: item.PostalCode,
    CountyOrParish: item.CountyOrParish,
    Latitude: item.Latitude,
    Longitude: item.Longitude,
    ListingContractDate: item.ListingContractDate,
    ModificationTimestamp: item.ModificationTimestamp,
    PhotosChangeTimestamp: item.PhotosChangeTimestamp,
    ListOfficeName: item.ListOfficeName,
    ListOfficeMlsId: item.ListOfficeMlsId,
    ListOfficePhone: item.ListOfficePhone,
    ListAgentName: item.ListAgentName,
    ListAgentMlsId: item.ListAgentMlsId,
    ListAgentEmail: item.ListAgentEmail,
    ListAgentPreferredPhone: item.ListAgentPreferredPhone,
    OriginatingSystemName: item.OriginatingSystemName,
    PublicRemarks: item.PublicRemarks,
    PrivateRemarks: item.PrivateRemarks,
    YearBuilt: item.YearBuilt,
    ParkingTotal: item.ParkingTotal,
    GarageSpaces: item.GarageSpaces,
    GarageYN: item.GarageYN,
    AssociationFee: item.AssociationFee,
    AssociationFeeFrequency: item.AssociationFeeFrequency,
    Appliances: item.Appliances,
    Cooling: item.Cooling,
    Heating: item.Heating,
    WaterSource: item.WaterSource,
    Sewer: item.Sewer,
    ConstructionMaterials: item.ConstructionMaterials,
    ArchitecturalStyle: item.ArchitecturalStyle,
    TaxAnnualAmount: item.TaxAnnualAmount,
    TaxYear: item.TaxYear,
    ParcelNumber: item.ParcelNumber,
    Fencing: item.Fencing,
    FireplaceFeatures: item.FireplaceFeatures,
    Flooring: item.Flooring,
    FoundationDetails: item.FoundationDetails,
    InteriorFeatures: item.InteriorFeatures,
    ExteriorFeatures: item.ExteriorFeatures,
    LotFeatures: item.LotFeatures,
    PatioAndPorchFeatures: item.PatioAndPorchFeatures,
    PoolFeatures: item.PoolFeatures,
    Roof: item.Roof,
    View: item.View,
    VirtualTourURLUnbranded: item.VirtualTourURLUnbranded,
    PostalCity: item.PostalCity,
    ElementarySchool: item.ElementarySchool,
    MiddleOrJuniorSchool: item.MiddleOrJuniorSchool,
    HighSchool: item.HighSchool,
    Media: media,
    DaysOnMarket: item.DaysOnMarket,
    MajorChangeTimestamp: item.MajorChangeTimestamp,
    OnMarketDate: item.OnMarketDate,
    OriginalEntryTimestamp: item.OriginalEntryTimestamp,
    PriceChangeTimestamp: item.PriceChangeTimestamp,
    CloseDate: item.CloseDate,
    ClosePrice: item.ClosePrice,
    BuyerAgentName: item.BuyerAgentName,
    BuyerAgentMlsId: item.BuyerAgentMlsId,
    BuyerOfficeName: item.BuyerOfficeName,
    BuyerOfficeMlsId: item.BuyerOfficeMlsId,
  };
}

function normalizeResponse(data) {
  return {
    success: true,
    data: (data.value || []).map(normalizeProperty),
    totalCount: data['@odata.count'] || data.value?.length || 0,
    nextLink: data['@odata.nextLink'] || null,
  };
}

module.exports = {
  buildODataFilter,
  buildODataQuery,
  fetchWithRetry,
  normalizeProperty,
  normalizeResponse,
};
