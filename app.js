require('dotenv').config();

var express             = require('express'),
    app                 = express(),
    bodyParser          = require('body-parser'),
    mongoose            = require('mongoose'),
    flash               = require('connect-flash'),
    passport            = require('passport'),
    LocalStrategy       = require('passport-local'), 
    methodOverride      = require('method-override'),
    Campground          = require('./models/campground'),
    Comment             = require('./models/comment'),
    User                = require('./models/user'),
    seedDB              = require('./seeds')
    
//requiring routes
var commentRoutes       = require('./routes/comments'),
    reviewRoutes        = require('./routes/reviews'),
    campgroundRoutes    = require('./routes/campgrounds'),
    indexRoutes         = require('./routes/index');
    
mongoose.connect(process.env.DATABASEURL, { useNewUrlParser: true });
//mongoose.connect('mongodb://localhost/yelp_camp_v17Deployed', { useNewUrlParser: true });
//mongoose.connect('mongodb+srv://runcycle:Scorpion73@cluster0-9lflk.mongodb.net/yelp_camp?retryWrites=true');

app.use(bodyParser.urlencoded({extended: true}));
app.set('view engine', 'ejs');
app.use(methodOverride('_method'));
app.use(express.static(__dirname + '/public'));
app.use(flash());
//seedDB();

app.locals.moment = require('moment');

//PASSPORT CONFIGURATION
app.use(require('express-session')({
    secret: 'Once again Rusty wins cutest dog!',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(async function(req, res, next){
  res.locals.currentUser = req.user;
  if(req.user) {
    try {
      let user = await User.findById(req.user._id).populate('notifications', null, { isRead: false }).exec();
      res.locals.notifications = user.notifications.reverse();
    } catch(err) {
      console.log(err.message);
    }
  }
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  next();
});

app.use(indexRoutes);
app.use('/campgrounds', campgroundRoutes);
app.use('/campgrounds/:id/comments', commentRoutes);
app.use('/campgrounds/:id/reviews', reviewRoutes);

app.listen(process.env.PORT, process.env.IP, function(){
    console.log('The YelpCamp Server Has started!!!');
});