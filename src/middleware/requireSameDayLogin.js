// middleware/requireSameDayLogin.js
const dayjs = require('dayjs'); // install `npm i dayjs`
const supabase = require('../config/supabase');
const MAX_HOURS_AFTER_MIDNIGHT = 6;

module.exports = async function requireSameDayLogin(req, res, next) {
  try {
    // assume token already decoded and user id placed on req.user
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { data, error } = await supabase
      .from('profiles_onboard')
      .select('last_login')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('requireSameDayLogin supabase error', error);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const lastLoginDate = data?.last_login ? dayjs(data.last_login).utc().format('YYYY-MM-DD') : null;
    const today = dayjs().utc().format('YYYY-MM-DD');

    if (lastLoginDate !== today) {
      return res.status(401).json({ message: 'Session expired for today. Please login again.' });
    }

    return next();
  } catch (err) {
    console.error('requireSameDayLogin error', err);
    return res.status(500).json({ message: 'Auth check failed' });
  }
};
