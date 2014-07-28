var fs_reverse = require( "fs-reverse" );
var db = require( "dbstream" );
var util = require( "util" );
var sift = require( "sift" );
var fs = require( "fs" );

// enable mocking the fs_reverse
if ( fs_reverse.stream ) {
    fs_reverse = fs_reverse.stream;
}

util.inherits( Cursor, db.Cursor );
function Cursor ( file ) {
    Cursor.super_.call( this );
    this._file = file;
}

Cursor.prototype._save = function( obj, callback ) {
    if ( !obj.id ) {
        obj.id = ( Math.random() * 1e17 ).toString( 36 );
    }
    fs.appendFile( this._file, JSON.stringify( obj ) + "\n", callback );
};

Cursor.prototype._remove = function ( obj, callback ) {
    obj = { id: obj.id, $removed: true };
    fs.appendFile( this._file, JSON.stringify( obj ) + "\n", callback );
}

Cursor.prototype._load = function () {
    if ( this._loading ) return;
    this._loading = true;

    var sifter = sift( this._query );
    var limit = this._limit || Infinity;
    var skip = this._skip || 0;
    var that = this;

    var seen = {};
    fs_reverse( this._file )
        .on( "data", function ( obj ) {
            // skip everything past the limit
            if ( limit <= 0 ) return;

            try {
                obj = JSON.parse( obj.trim() );
            } catch ( e ) {
                return;
            }

            // skip seen objects
            if ( seen[ obj.id ] ) return;
            seen[ obj.id ] = true;

            // skip removed objects
            if ( obj.$removed ) return;

            // skip objects that don't meet the query criteria
            if ( !sifter.test( obj ) ) return;

            if ( skip-- <= 0 ) {
                that.push( obj );
                if ( --limit <= 0 ) {
                    that.push( null );
                }
            }
            
        })
        .on( "end", function() {
            that._loading = false;
        });
};

function compact ( from, to ) {
    new Cursor( from )
        .find({})
        .pipe( new Cursor( to ) );
}

module.exports.connect = function ( file ) {
    util.inherits( FilesystemCursor, Cursor );
    function FilesystemCursor () {
        FilesystemCursor.super_.call( this, file );
    }

    return {
        Cursor: FilesystemCursor,
        compact: function( to ) { compact( file, to ); }
    }
}