const mongoose  = require('mongoose');
const { Schema }  = mongoose;
const PostSchema = new Schema({
    description: String,
    image: String,
    user: String,
    comments: Array
},{collection: "posts", timestamps: true});
module.exports = mongoose.model('posts', PostSchema);
