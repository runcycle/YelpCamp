var express             = require('express');
var router              = express.Router();
var multer              = require('multer');
var Campground          = require('../models/campground');
var Comment             = require("../models/comment");
var User                = require("../models/user");
var Notification        = require("../models/notification");
var middleware          = require('../middleware');
var Review              = require("../models/review");

var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'runcycle', 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

//INDEX - show all campgrounds
router.get("/", function(req, res){
    var perPage = 8;
    var pageQuery = parseInt(req.query.page);
    var pageNumber = pageQuery ? pageQuery : 1;
    var noMatch = null;
    if(req.query.search) {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
        Campground.find({name: regex}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.count({name: regex}).exec(function (err, count) {
                if (err) {
                    console.log(err);
                    res.redirect("back");
                } else {
                    if(allCampgrounds.length < 1) {
                        noMatch = "No campgrounds match that query, please try again.";
                    }
                    res.render("campgrounds/index", {
                        campgrounds: allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        noMatch: noMatch,
                        search: req.query.search
                    });
                }
            });
        });
    } else {
        // get all campgrounds from DB
        Campground.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.count().exec(function (err, count) {
                if (err) {
                    console.log(err);
                } else {
                    res.render("campgrounds/index", {
                        campgrounds: allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        noMatch: noMatch,
                        search: false
                    });
                }
            });
        });
    }
});

// CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), function(req, res){
    cloudinary.uploader.upload(req.file.path, async function(result) {
      //add cloudinary url for the image to the campground object under image property
      //get data from form and add to campgrounds array
        var name = req.body.name;
        var price = req.body.price;
        var image = result.secure_url;
        var imageId = result.public_id;
        var desc = req.body.description;
        var location = req.body.location;
        var author = {
            id: req.user._id,
            username: req.user.username
        };
        var newCampground = {name: name, price: price, image: image, imageId: imageId, description: desc, author: author, location: location};
        //Create a new campground and save to DB
        try {
          let campground = await Campground.create(newCampground);
          let user = await User.findById(req.user._id).populate('followers').exec();
          let newNotification = {
            username: req.user.username,
            campgroundId: campground.id
          }
          for(const follower of user.followers) {
            let notification = await Notification.create(newNotification);
            follower.notifications.push(notification);
            follower.save();
          }
          //redirect back to campgrounds page
          res.redirect(`/campgrounds/${campground.id}`);
            } catch(err) {
              req.flash('error', err.message);
              res.redirect('back');
            }
        });
});

// NEW - show form to create new campground
router.get('/new', middleware.isLoggedIn, function(req, res){
    res.render('campgrounds/new');
});

// SHOW - shows more info about one campground
router.get('/:id', function(req, res){
    //find the campground with provided ID
    Campground.findById(req.params.id).populate('comments').populate({
        path: "reviews",
        options: {sort: {createdAt: -1}}
    }).exec(function(err, foundCampground){
        if(err || !foundCampground){
            req.flash('error', 'Campground not found.');
            res.redirect('back');
        } else {
            console.log(foundCampground);
            //render show template with that campground
            res.render('campgrounds/show', {campground: foundCampground});
        }
    });
});

// EDIT CAMPGROUND ROUTE
router.get('/:id/edit', middleware.checkCampgroundOwnership, function(req, res){
   Campground.findById(req.params.id, function(err, foundCampground){
       if(err){
           console.log(err);
           res.redirect('back');
       } else {
           res.render('campgrounds/edit', {campground: foundCampground});
       }
    });
});

router.put("/:id", middleware.checkCampgroundOwnership, upload.single('image'), function(req, res){
    delete req.body.campground.rating;
    Campground.findByIdAndUpdate(req.params.id, req.body.campground, async function(err, campground){
        if(err){
            req.flash("error", err.message);
            res.redirect("back");
        } else {
            if (req.file) {
              try {
                  await cloudinary.uploader.destroy(campground.imageId);
                  var result = await cloudinary.uploader.upload(req.file.path);
                  campground.imageId = result.public_id;
                  campground.image = result.secure_url;
              } catch(err) {
                  req.flash("error", err.message);
                  return res.redirect("back");
              }
            }
            campground.name = req.body.campground.name;
            campground.price = req.body.campground.price;
            campground.description = req.body.campground.description;
            campground.location = req.body.campground.location;
            campground.save();
            req.flash("success","Successfully Updated!");
            res.redirect("/campgrounds/" + campground._id);
        }
    });
}); 

/*
// UPDATE CAMPGROUND ROUTE
router.put('/:id', middleware.checkCampgroundOwnership, upload.single('image'), function(req, res){
    delete req.body.campground.rating;
    //find and update the correct campground
    Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground){
      if(err){
          res.redirect('/campgrounds');
      } else {
          res.redirect('/campgrounds/' + req.params.id);
      }
   });
   //redirect somewhere - show page
});  
*/

// DESTROY CAMPGROUND ROUTE
router.delete('/:id', middleware.checkCampgroundOwnership, function(req, res){
   Campground.findById(req.params.id, function (err, campground) {
        if (err) {
            req.flash("error", err.message);
            return res.redirect("back");
        } else {
            // deletes all comments associated with the campground
            Comment.remove({"_id": {$in: campground.comments}}, function (err) {
                if (err) {
                    console.log(err);
                    return res.redirect("/campgrounds");
                }
                // deletes all reviews associated with the campground
                Review.remove({"_id": {$in: campground.reviews}}, function (err) {
                    if (err) {
                        req.flash("error", err.message);
                        return res.redirect("back");
                    }
                    //  delete the campground
                    campground.remove();
                    cloudinary.uploader.destroy(campground.imageId);
                    req.flash("success", "Campground deleted successfully!");
                    res.redirect("/campgrounds");
                });
            });
        }
    });
});

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

module.exports = router;