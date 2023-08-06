const mongoose = require("mongoose");
const { Schema } = mongoose;
const CommentSchema = new Schema({
    description: String,
    user: String,
}, {collection: "comments", timestamps: true})
module.exports = mongoose.model('comments', CommentSchema);

