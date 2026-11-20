export default defineI18nConfig(() => ({
  numberFormats: {
    ru: {
      distance: {
        style: 'unit',
        unit: 'kilometer',
        unitDisplay: 'short',
      },
      duration: {
        style: 'unit',
        unit: 'day',
        unitDisplay: 'long',
      },
    },
  },
}));
